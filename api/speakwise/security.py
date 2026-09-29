"""Supabase authorization and bounded, single-process AI abuse protection."""
from collections import OrderedDict, deque
from functools import lru_cache
from contextvars import ContextVar
import asyncio
import json
import logging
import os
import time
from uuid import uuid4

import httpx
from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger('speakwise')
request_id = ContextVar('request_id', default=None)
MAX_BODY_BYTES = 128 * 1024


@lru_cache(maxsize=1)
def auth_client():
    return httpx.AsyncClient(timeout=httpx.Timeout(8, connect=3), limits=httpx.Limits(max_connections=30))


class RequestBudget:
    """No awaits between check and increment: atomic within one event loop.

    Deploy a single worker/instance; use a shared limiter before scaling out.
    """
    def __init__(self):
        self.users = OrderedDict()
        self.active = {}

    def acquire(self, user_id):
        now = time.monotonic()
        while self.users and next(iter(self.users.values()))[-1] <= now - 3600:
            self.users.popitem(last=False)
        if user_id not in self.users and len(self.users) >= 10000:
            raise HTTPException(503, 'The service is busy. Please try again shortly.')
        history = self.users.get(user_id, deque())
        while history and history[0] <= now - 3600:
            history.popleft()
        if len(history) >= 300 or sum(t > now - 60 for t in history) >= 30:
            raise HTTPException(429, 'Too many requests. Please wait before trying again.', headers={'Retry-After': '60'})
        if self.active.get(user_id, 0) >= 2 or sum(self.active.values()) >= 24:
            raise HTTPException(429, 'A request is already in progress. Please wait.', headers={'Retry-After': '3'})
        history.append(now)
        self.users[user_id] = history
        self.users.move_to_end(user_id)
        self.active[user_id] = self.active.get(user_id, 0) + 1

    def release(self, user_id):
        count = self.active.get(user_id, 0) - 1
        if count > 0:
            self.active[user_id] = count
        else:
            self.active.pop(user_id, None)


budget = RequestBudget()


async def authorize_request(request: Request):
    authorization = request.headers.get('authorization', '')
    if not authorization.startswith('Bearer ') or not authorization[7:].strip() or len(authorization) > 8192:
        raise HTTPException(401, 'Sign in to use SpeakWise.', headers={'WWW-Authenticate': 'Bearer'})
    url = os.getenv('SUPABASE_URL', '').rstrip('/')
    key = os.getenv('SUPABASE_ANON_KEY', '')
    if not url or not key:
        raise HTTPException(503, 'Authentication is temporarily unavailable.')
    try:
        response = await auth_client().get(f'{url}/auth/v1/user', headers={'apikey': key, 'Authorization': authorization})
        if response.status_code in (401, 403):
            raise HTTPException(401, 'Your session expired. Please sign in again.', headers={'WWW-Authenticate': 'Bearer'})
        if not response.is_success:
            raise HTTPException(503, 'Authentication is temporarily unavailable.')
        user = response.json()
        # Supabase anonymous sessions are deliberately not a paid-AI entitlement.
        if not isinstance(user, dict) or not user.get('id') or user.get('is_anonymous'):
            raise HTTPException(401, 'Sign in to use SpeakWise.')
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, 'Authentication is temporarily unavailable.') from None
    budget.acquire(user['id'])
    try:
        yield user['id']
    finally:
        budget.release(user['id'])


def install_request_guards(app):
    @app.middleware('http')
    async def request_guard(request, call_next):
        request.state.request_id = uuid4().hex
        request_id.set(request.state.request_id)
        started = time.monotonic()
        try:
            if request.method == 'POST':
                try:
                    declared_size = int(request.headers.get('content-length', '0'))
                except ValueError:
                    return JSONResponse({'error': 'Invalid content length.', 'code': 'invalid_request'}, status_code=400)
                if declared_size < 0 or declared_size > MAX_BODY_BYTES:
                    return JSONResponse({'error': 'Request is too large.', 'code': 'payload_too_large'}, status_code=413)
                chunks, size = [], 0
                async with asyncio.timeout(10):
                    async for chunk in request.stream():
                        size += len(chunk)
                        if size > MAX_BODY_BYTES:
                            return JSONResponse({'error': 'Request is too large.', 'code': 'payload_too_large'}, status_code=413)
                        chunks.append(chunk)
                request._body = b''.join(chunks)
            response = await call_next(request)
        except TimeoutError:
            response = JSONResponse({"error": "Request timed out.", "code": "request_timeout"}, status_code=408)
        except Exception as exc:
            # Exception text may contain provider responses, URLs or user content.
            logger.error(json.dumps({'event': 'request_failed', 'request_id': request.state.request_id, 'type': type(exc).__name__}))
            response = JSONResponse({'error': 'The service is temporarily unavailable.', 'code': 'internal_error'}, status_code=500)
        elapsed = round((time.monotonic() - started) * 1000, 1)
        response.headers['X-Request-ID'] = request.state.request_id
        response.headers['Cache-Control'] = 'no-store'
        response.headers['Server-Timing'] = f'api;dur={elapsed}'
        logger.info(json.dumps({'event': 'request', 'request_id': request.state.request_id, 'path': request.url.path, 'status': response.status_code, 'headers_ms': elapsed}))
        return response

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return JSONResponse({'error': exc.detail, 'code': f'http_{exc.status_code}'}, status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        # Do not echo Pydantic's input field: it can contain private conversation text.
        return JSONResponse({'error': 'Invalid request. Check the supplied fields and their length.', 'code': 'invalid_request'}, status_code=422)
