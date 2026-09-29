"""Offline integration tests. All authentication and provider traffic is mocked."""
import asyncio
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
        for route in ['chat', 'voice', 'feedback', 'improved-version', 'lesson-summary']:
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

    async def test_voice_first_chunk_precedes_completion_and_disconnect_closes(self):
        state = {'closed': False, 'tail': False}
        async def chunks(chunk_size):
            yield b'first-mp3-chunk'
            state['tail'] = True
            yield b'last-mp3-chunk'
        @asynccontextmanager
        async def speech_context(**kwargs):
            try:
                yield SimpleNamespace(iter_bytes=chunks)
            finally:
                state['closed'] = True
        self.ai.audio = SimpleNamespace(speech=SimpleNamespace(with_streaming_response=SimpleNamespace(create=speech_context)))
        request = Request({'type': 'http', 'headers': []})
        request.state.request_id = 'fixture-request'
        response = await main.voice(VoiceRequest(text='Hello'), request)
        self.assertFalse(state['tail'])
        self.assertEqual(await anext(response.body_iterator), b'first-mp3-chunk')
        self.assertFalse(state['tail'])
        await response.body_iterator.aclose()
        self.assertTrue(state['closed'])

    async def test_voice_initial_failure_returns_json_error(self):
        @asynccontextmanager
        async def failed(**kwargs):
            raise TimeoutError('PRIVATE')
            yield
        self.ai.audio = SimpleNamespace(speech=SimpleNamespace(with_streaming_response=SimpleNamespace(create=failed)))
        response = await self.client.post('/api/voice', headers=self.headers, json={'text': 'hello'})
        self.assertEqual(response.status_code, 504)
        self.assertNotIn('PRIVATE', response.text)
        self.assertEqual(security.budget.active, {})

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
