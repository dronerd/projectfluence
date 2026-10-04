"""Offline integration tests. All authentication and provider traffic is mocked."""
import asyncio
import base64
import io
import wave
from contextlib import asynccontextmanager
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import Request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main
import security
from contracts import VoiceRequest
import realtime


class TextStream:
    def __init__(self, parts=None, gate=None):
        self.parts = parts if parts is not None else ['Hello ', 'there.']
        self.gate = gate
        self.closed = False

    def __aiter__(self):
        return self.chunks()

    async def chunks(self):
        for text in self.parts:
            if self.gate:
                await self.gate.wait()
            yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=text))])

    async def close(self):
        self.closed = True


class ApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.env = patch.dict(os.environ, {'SUPABASE_URL': 'https://auth.test', 'SUPABASE_ANON_KEY': 'public-fixture'})
        self.env.start()
        self.auth_status = 200
        self.anonymous = False
        self.auth = httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(
            self.auth_status, json={'id': 'fixture-user', 'is_anonymous': self.anonymous})))
        self.auth_patch = patch('security.auth_client', return_value=self.auth)
        self.auth_patch.start()
        security.budget = security.RequestBudget()
        self.stream = TextStream()
        self.create = AsyncMock(return_value=self.stream)
        self.ai = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=self.create)))
        self.ai_patch = patch('main.get_openai_client', return_value=self.ai)
        self.ai_patch.start()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='https://api.test')
        self.headers = {'Authorization': 'Bearer fixture-access-token'}

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.auth.aclose()
        self.ai_patch.stop()
        self.auth_patch.stop()
        self.env.stop()

    async def test_all_paid_routes_require_auth(self):
        for route in ['chat', 'voice', 'feedback', 'improved-version', 'lesson-summary', 'realtime/calls']:
            response = await self.client.post('/api/' + route, json={})
            self.assertEqual(response.status_code, 401, route)
            self.assertIn('error', response.json())
        self.create.assert_not_called()

    async def test_expired_anonymous_and_unavailable_auth(self):
        for status, anonymous, expected in [(401, False, 401), (200, True, 401), (503, False, 503)]:
            self.auth_status, self.anonymous = status, anonymous
            response = await self.client.post('/api/chat', headers=self.headers, json={'message': 'Hello'})
            self.assertEqual(response.status_code, expected)
        self.create.assert_not_called()

    async def test_reject_invalid_fields_and_large_body_without_private_echo(self):
        for route, data in [('voice', {'text': 'hello', 'voice': 'invalid'}),
                            ('chat', {'message': {'secret': 'PRIVATE'}}),
                            ('chat', {'message': 'PRIVATE' * 2000}),
                            ('chat', {'history': [{'role': 'system', 'content': 'PRIVATE'}]})]:
            response = await self.client.post('/api/' + route, headers=self.headers, json=data)
            self.assertEqual(response.status_code, 422)
            self.assertNotIn('PRIVATE', response.text)
        response = await self.client.post('/api/chat', headers=self.headers, json={'message': 'x' * 140000})
        self.assertEqual(response.status_code, 413)
        self.create.assert_not_called()

    async def test_chat_is_async_closes_stream_and_retains_contract(self):
        gate = asyncio.Event()
        self.stream.gate = gate
        task = asyncio.create_task(self.client.post('/api/chat', headers=self.headers, json={'mode': 'agent', 'message': 'Hello'}))
        await asyncio.sleep(0.02)
        health = await asyncio.wait_for(self.client.get('/health'), timeout=0.2)
        self.assertEqual(health.status_code, 200)
        self.assertFalse(task.done())
        gate.set()
        response = await task
        self.assertEqual(response.json(), {'reply': 'Hello there.', 'mode': 'agent'})
        self.assertTrue(self.stream.closed)
        self.assertIn('x-request-id', response.headers)
        self.assertEqual(response.headers['cache-control'], 'no-store')
        self.assertEqual(security.budget.active, {})

    async def test_provider_errors_are_sanitized_not_retried(self):
        self.create.side_effect = TimeoutError('PRIVATE provider API key or content')
        response = await self.client.post('/api/chat', headers=self.headers, json={'message': 'hello'})
        self.assertEqual(response.status_code, 504)
        self.assertNotIn('PRIVATE', response.text)
        self.assertEqual(self.create.await_count, 1)
        self.assertEqual(security.budget.active, {})

    async def test_summary_strings_match_persistence_contract(self):
        summary = main.normalize_lesson_summary({'covered': ['x' * 2000],
            'recommendations': ['y' * 2000], 'mistakes': [{'type': 't' * 2000}]})
        self.assertEqual(len(summary['covered'][0]), 500)
        self.assertEqual(len(summary['recommendations'][0]), 500)
        self.assertEqual(len(summary['mistakes'][0]['type']), 80)

    async def test_bad_summary_does_not_report_success(self):
        self.stream.parts = ['not JSON']
        response = await self.client.post('/api/lesson-summary', headers=self.headers,
            json={'history': [{'role': 'user', 'content': 'Hello'}]})
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('summary', response.json())

    async def test_request_limits_release_and_deny_without_provider_call(self):
        for _ in range(30):
            security.budget.acquire('fixture-user')
            security.budget.release('fixture-user')
        response = await self.client.post('/api/chat', headers=self.headers, json={'message': 'hello'})
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers['retry-after'], '60')
        self.create.assert_not_called()

    def mock_realtime(self, status='completed', fail=False):
        state = {'closed': False}
        update, create = AsyncMock(), AsyncMock()
        class Connection:
            session = SimpleNamespace(update=update)
            response = SimpleNamespace(create=create)
            def __aiter__(self):
                return self.events()
            async def events(self):
                yield SimpleNamespace(type='response.output_audio.delta', delta=base64.b64encode(b'\x00\x00' * 240).decode())
                yield SimpleNamespace(type='response.done', response=SimpleNamespace(status=status))
        @asynccontextmanager
        async def connect(**kwargs):
            state['model'] = kwargs['model']
            try:
                if fail:
                    raise TimeoutError('PRIVATE')
                yield Connection()
            finally:
                state['closed'] = True
        self.ai.realtime = SimpleNamespace(connect=connect)
        return state, update, create

    async def test_realtime_read_aloud_returns_replayable_wav_and_closes(self):
        state, update, create = self.mock_realtime()
        response = await self.client.post('/api/voice', headers=self.headers, json={'text': 'Hello', 'voice': 'marin'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['content-type'], 'audio/wav')
        with wave.open(io.BytesIO(response.content)) as audio:
            self.assertEqual((audio.getframerate(), audio.getnchannels(), audio.getsampwidth()), (24000, 1, 2))
            self.assertEqual(audio.getnframes(), 240)
        self.assertEqual(state['model'], 'gpt-realtime-2.1-mini')
        self.assertEqual(update.call_args.kwargs['session']['audio']['output']['voice'], 'marin')
        self.assertEqual(create.call_args.kwargs['response']['conversation'], 'none')
        self.assertTrue(state['closed'])

    async def test_realtime_audio_incomplete_or_failed_never_returns_success(self):
        for status, fail, expected in [('incomplete', False, 502), ('completed', True, 504)]:
            state, _, _ = self.mock_realtime(status, fail)
            response = await self.client.post('/api/voice', headers=self.headers, json={'text': 'hello'})
            self.assertEqual(response.status_code, expected)
            self.assertNotIn('PRIVATE', response.text)
            self.assertTrue(state['closed'])
            self.assertEqual(security.budget.active, {})

    async def test_luna_preserves_text_and_json_contract_with_no_reasoning(self):
        await main.complete([{'role': 'user', 'content': 'hello'}], 850, response_format={'type': 'json_object'})
        args = self.create.call_args.kwargs
        self.assertEqual(args['model'], 'gpt-6-luna')
        self.assertEqual(args['reasoning_effort'], 'none')
        self.assertEqual(args['max_completion_tokens'], 850)
        self.assertNotIn('max_tokens', args)
        self.assertEqual(args['response_format'], {'type': 'json_object'})

    async def test_realtime_signaling_uses_owned_lesson_and_server_credentials(self):
        session = {'level': 'B1', 'lesson_mode': 'speaking_practice', 'status': 'active', 'planned_duration_minutes': 5}
        store = SimpleNamespace(own=AsyncMock(return_value=session), call=AsyncMock(return_value=[]))
        provider = AsyncMock(return_value=httpx.Response(201, text='v=0 fixture answer', headers={'Location': '/v1/realtime/calls/rtc_fixture'}))
        try:
            with patch('realtime.Store', return_value=store), patch('realtime.learner_context', AsyncMock(return_value={})), patch('realtime.provider_request', provider):
                response = await self.client.post('/api/realtime/calls', headers=self.headers, json={
                    'sessionId': '00000000-0000-4000-8000-000000000001', 'sdp': 'v=0 fixture offer', 'voice': 'cedar'})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json(), {'sdp': 'v=0 fixture answer', 'callId': 'rtc_fixture', 'expiresIn': 300})
                import json
                config = json.loads(provider.call_args.kwargs['files']['session'][1])
                self.assertEqual(config['model'], 'gpt-realtime-2.1-mini')
                self.assertTrue(config['audio']['input']['turn_detection']['interrupt_response'])
                self.assertEqual(config['audio']['input']['transcription']['model'], 'gpt-transcribe')
                self.assertNotIn('api_key', response.text)
                store.own.assert_awaited_once()
                duplicate = await self.client.post('/api/realtime/calls', headers=self.headers, json={
                    'sessionId': '00000000-0000-4000-8000-000000000001', 'sdp': 'v=0 fixture offer'})
                self.assertEqual(duplicate.status_code, 200, 'Reconnect replaces the caller’s stale call')
                self.assertEqual(len(realtime.calls), 1)
                ended = await self.client.delete('/api/realtime/calls/rtc_fixture', headers=self.headers)
                self.assertEqual(ended.status_code, 200)
                self.assertFalse(realtime.calls)
        finally:
            for _, task in realtime.calls.values(): task.cancel()
            realtime.calls.clear()

    async def test_realtime_denies_other_owners_and_sanitizes_provider_failure(self):
        from fastapi import HTTPException
        store = SimpleNamespace(own=AsyncMock(side_effect=HTTPException(404, 'Unavailable')))
        payload = {'sessionId': '00000000-0000-4000-8000-000000000001', 'sdp': 'v=0 fixture offer'}
        with patch('realtime.Store', return_value=store), patch('realtime.provider_request', AsyncMock()) as provider:
            response = await self.client.post('/api/realtime/calls', headers=self.headers, json=payload)
            self.assertEqual(response.status_code, 404)
            provider.assert_not_called()
        store.own = AsyncMock(return_value={'status': 'active'})
        store.call = AsyncMock(return_value=[])
        with patch('realtime.Store', return_value=store), patch('realtime.learner_context', AsyncMock(return_value={})), patch('realtime.provider_request', AsyncMock(side_effect=TimeoutError('PRIVATE'))):
            response = await self.client.post('/api/realtime/calls', headers=self.headers, json=payload)
            self.assertEqual(response.status_code, 504)
            self.assertNotIn('PRIVATE', response.text)
            self.assertFalse(realtime.starting)

    async def test_realtime_hangup_is_idempotent_after_provider_disconnect(self):
        request = httpx.Request('POST', 'https://provider.test/realtime/calls/rtc_gone/hangup')
        for status in (404, 410):
            response = httpx.Response(status, request=request)
            error = httpx.HTTPStatusError('Call already ended', request=request, response=response)
            with patch('realtime.provider_request', AsyncMock(side_effect=error)):
                await realtime.close_call('rtc_gone')

    async def test_cors_allows_auth_header_only_for_allowed_origin(self):
        response = await self.client.options('/api/chat', headers={'Origin': 'http://localhost:3000',
            'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Authorization, Content-Type'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['access-control-allow-origin'], 'http://localhost:3000')
        response = await self.client.options('/api/chat', headers={'Origin': 'https://attacker.test',
            'Access-Control-Request-Method': 'POST'})
        self.assertNotIn('access-control-allow-origin', response.headers)


if __name__ == '__main__':
    unittest.main()
