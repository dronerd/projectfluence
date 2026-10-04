"""Authenticated learning actions; the application, never the model, owns writes.

All private queries use both the validated caller's ID and their Supabase JWT.
No service-role credential, arbitrary URL fetch, or caller-supplied source text.
"""
import asyncio
import hashlib
import json
import logging
import math
import os
import re
from datetime import datetime, timezone
from typing import Annotated, Literal, Union
from urllib.parse import unquote
from uuid import UUID, uuid4, uuid5

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError

from contracts import Level
from documents import MAX_PDF_BYTES, PdfProcessorBusy, coverage, document_chunks, extract_pdf, lexical_rank, tokens
from prompts import COVERAGE_POLICY, GROUNDED_CHAT_POLICY, PROMPT_VERSION, SCHEMA_VERSION, SCRIPT_POLICY
from security import auth_client, authorize_request

router = APIRouter()
logger = logging.getLogger('speakwise')
Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=240)]
ContentId = Annotated[str, StringConstraints(pattern=r'^[A-Za-z0-9_-]{1,80}$')]
LessonMode = Literal['natural_conversation', 'vocabulary_phrase', 'grammar_practice', 'speaking_practice',
    'pronunciation_practice', 'listening_practice', 'reading_comprehension', 'pdf_reading',
    'writing_feedback', 'deep_discussion', 'review_weakness']


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class RetrievalRequest(StrictModel):
    query: Annotated[str, StringConstraints(max_length=2000)] = ''
    scope: Literal['focused', 'whole'] = 'focused'


class ChatInput(StrictModel):
    sessionId: UUID
    requestId: UUID = Field(default_factory=uuid4)
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8000)]
    documentId: UUID | None = None
    contentId: ContentId | None = None
    scriptId: UUID | None = None
    scope: Literal['focused', 'whole'] | None = None
    # These selected preferences are bounded data, not model instructions. Session
    # values are authoritative when present; targetLanguage is an explicit setting.
    level: Level = 'B2'
    targetLanguage: Short = 'English'
    lessonMode: LessonMode = 'natural_conversation'
    topics: list[Short] = Field(default_factory=list, max_length=12)


class ScriptInput(StrictModel):
    requestId: UUID
    sessionId: UUID | None = None
    documentId: UUID | None = None
    contentId: ContentId | None = None
    topic: Annotated[str, StringConstraints(max_length=2000)] = ''
    level: Level = 'B2'
    targetLanguage: Short = 'English'
    kind: Literal['adaptation', 'original', 'excerpt'] = 'adaptation'
    lengthWords: int = Field(default=250, ge=80, le=1000)
    vocabulary: list[Short] = Field(default_factory=list, max_length=20)


class SearchAction(StrictModel):
    type: Literal['search_content']
    query: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    contentType: Literal['all', 'video', 'text'] = 'all'


class PracticeAction(StrictModel):
    type: Literal['practice_vocabulary']
    word: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class ScriptAction(StrictModel):
    type: Literal['create_script']
    topic: Annotated[str, StringConstraints(max_length=2000)] = ''
    kind: Literal['adaptation', 'original', 'excerpt'] = 'adaptation'
    lengthWords: int = Field(default=250, ge=80, le=1000)


class MaterialsAction(StrictModel):
    type: Literal['open_materials']
    material: Literal['pdf', 'vocabstream', 'vidmatch', 'reading']


Action = Annotated[Union[SearchAction, PracticeAction, ScriptAction, MaterialsAction], Field(discriminator='type')]


class Observation(StrictModel):
    type: Literal['grammar', 'vocabulary', 'expression']
    original: Annotated[str, StringConstraints(min_length=3, max_length=400)]
    correction: Annotated[str, StringConstraints(min_length=1, max_length=400)]
    explanation: Annotated[str, StringConstraints(max_length=400)]
    evidenceMessageId: UUID


class ChatOutput(StrictModel):
    reply: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10000)]
    sourceIds: list[Short] = Field(default_factory=list, max_length=24)
    action: Action | None = None
    observations: list[Observation] = Field(default_factory=list, max_length=2)


class Question(StrictModel):
    id: Short
    prompt: Annotated[str, StringConstraints(min_length=1, max_length=1000)]
    answer: Annotated[str, StringConstraints(min_length=1, max_length=1000)]
    explanation: Annotated[str, StringConstraints(max_length=1000)] = ''


class ScriptOutput(StrictModel):
    title: Short
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=40, max_length=18000)]
    sourceIds: list[Short] = Field(default_factory=list, max_length=80)
    vocabulary: list[Short] = Field(default_factory=list, max_length=20)
    questions: list[Question] = Field(min_length=2, max_length=4)


class Store:
    def __init__(self, request: Request, user_id: str):
        self.user_id = user_id
        self.headers = {'Authorization': request.headers['authorization'],
                        'apikey': os.getenv('SUPABASE_ANON_KEY', ''), 'Prefer': 'return=representation'}
        self.url = os.getenv('SUPABASE_URL', '').rstrip('/') + '/rest/v1/'

    async def call(self, table, method='GET', params=None, data=None, prefer=None):
        headers = {**self.headers, **({'Prefer': prefer} if prefer else {})}
        try:
            response = await auth_client().request(method, self.url + table, params=params, json=data, headers=headers)
        except Exception:
            raise HTTPException(503, 'Learning storage is unavailable. Please retry; no progress was confirmed.') from None
        if response.status_code == 409:
            raise HTTPException(409, 'This operation already exists. Retry to recover its saved result.')
        if not response.is_success:
            logger.warning(json.dumps({'event': 'learning_storage_failure', 'table': table,
                                       'status': response.status_code}))
            raise HTTPException(503, 'Learning storage is unavailable. Check the SpeakWise migration and try again.')
        return response.json() if response.content else []

    async def own(self, table, key, value, select='*'):
        rows = await self.call(table, params={'select': select, 'user_id': f'eq.{self.user_id}', key: f'eq.{value}', 'limit': '1'})
        if not rows:
            raise HTTPException(404, 'This lesson or resource is unavailable for your account.')
        return rows[0]

    async def all_own(self, table, params=None, cap=5000):
        rows = []
        while len(rows) < cap:
            batch = await self.call(table, params={'select': '*', 'user_id': f'eq.{self.user_id}',
                **(params or {}), 'limit': str(min(500, cap - len(rows))), 'offset': str(len(rows))})
            rows.extend(batch)
            if len(batch) < 500:
                return rows, False
        return rows, True


def public_document(row, include_pages=False):
    result = {'id': row['id'], 'filename': row['filename'], 'status': row['text_status'],
              'pageCount': row['page_count'], 'readablePages': sum(p.get('status') == 'readable' for p in row['pages']) if 'pages' in row else row['page_count'] if row['text_status'] == 'ready' else None,
              'warnings': row.get('warnings', []), 'createdAt': row.get('created_at')}
    if include_pages:
        result['pages'] = row.get('pages', [])
    return result


def public_script(row):
    return {'id': row['id'], 'title': row['title'], 'body': row['body'], 'kind': row['kind'],
            'sourceReferences': row.get('source_refs', []), 'citations': row.get('source_refs', []),
            'settings': row.get('settings', {}), 'questions': row.get('questions', []),
            'vocabulary': row.get('vocabulary', []), 'createdAt': row.get('created_at'),
            'level': row.get('settings', {}).get('level'), 'targetLanguage': row.get('settings', {}).get('targetLanguage'),
            'promptVersion': row.get('prompt_version', PROMPT_VERSION)}


def request_fingerprint(payload):
    return hashlib.sha256(json.dumps(payload.model_dump(mode='json', exclude={'requestId'}),
        sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def require_matching_request(recorded, current):
    if recorded != current:
        raise HTTPException(409, 'This request ID belongs to different lesson input. Start a new action; the saved result was not changed.')


@router.post('/api/documents')
async def upload_document(request: Request, user_id=Depends(authorize_request)):
    if request.headers.get('content-type', '').split(';')[0].lower() != 'application/pdf':
        raise HTTPException(415, 'Choose a PDF file. Other file types are not supported.')
    filename = unquote(request.headers.get('x-filename', 'document.pdf'))
    filename = re.sub(r'[\x00-\x1f/\\]', '_', filename).strip()[:180]
    if not filename.lower().endswith('.pdf'):
        raise HTTPException(422, 'The filename must end with .pdf.')
    pieces, size = [], 0
    async with asyncio.timeout(10):
        async for piece in request.stream():
            size += len(piece)
            if size > MAX_PDF_BYTES:
                raise HTTPException(413, 'Choose a PDF of at most 8 MiB.')
            pieces.append(piece)
    data = b''.join(pieces)
    if not data or len(data) > MAX_PDF_BYTES:
        raise HTTPException(413, 'Choose a nonempty PDF of at most 8 MiB.')
    store = Store(request, user_id)
    sha = hashlib.sha256(data).hexdigest()
    previous = await store.call('speakwise_documents', params={'select': '*', 'user_id': f'eq.{user_id}', 'sha256': f'eq.{sha}', 'limit': '1'})
    if previous:
        return {'document': public_document(previous[0]), 'reused': True}
    # A failed extraction never creates a falsely ready document; browser shows
    # processing until this bounded request returns. Bytes are never persisted.
    try:
        extracted = await extract_pdf(data)
    except PdfProcessorBusy as exc:
        raise HTTPException(429, str(exc), headers={'Retry-After': '5'}) from None
    except TimeoutError:
        raise HTTPException(422, 'PDF processing exceeded 18 seconds. Split it into smaller files and try again.') from None
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    record = {'id': str(uuid5(UUID(user_id), sha)), 'user_id': user_id, 'filename': filename, 'sha256': sha, **extracted}
    saved = await store.call('speakwise_documents', 'POST', params={'on_conflict': 'id'}, data=record,
                             prefer='resolution=ignore-duplicates,return=representation')
    if not saved:
        saved = [await store.own('speakwise_documents', 'id', record['id'])]
    return {'document': public_document(saved[0]), 'reused': False}


@router.get('/api/documents')
async def list_documents(request: Request, offset: int = Query(default=0, ge=0, le=100000), user_id=Depends(authorize_request)):
    # Metadata-only listing keeps private text out of incidental list responses.
    rows = await Store(request, user_id).call('speakwise_documents', params={'select': 'id,filename,text_status,page_count,warnings,created_at',
        'user_id': f'eq.{user_id}', 'order': 'created_at.desc,id.desc', 'limit': '101', 'offset': str(offset)})
    return {'documents': [public_document(row) for row in rows[:100]], 'limit': 100,
            'nextOffset': offset + 100 if len(rows) > 100 else None}


@router.get('/api/documents/{document_id}')
async def get_document(document_id: UUID, request: Request, user_id=Depends(authorize_request)):
    return {'document': public_document(await Store(request, user_id).own('speakwise_documents', 'id', document_id), True)}


@router.delete('/api/documents/{document_id}')
async def delete_document(document_id: UUID, request: Request, user_id=Depends(authorize_request)):
    store = Store(request, user_id)
    await store.own('speakwise_documents', 'id', document_id)
    result = await store.call('rpc/delete_speakwise_document', 'POST', data={'p_document_id': str(document_id)})
    return {**result, 'documentId': str(document_id)}


@router.post('/api/documents/{document_id}/retrieve')
async def retrieve_document(document_id: UUID, payload: RetrievalRequest, request: Request, user_id=Depends(authorize_request)):
    document = await Store(request, user_id).own('speakwise_documents', 'id', document_id)
    chunks = document_chunks(document)
    selected = chunks if payload.scope == 'whole' else lexical_rank(chunks, payload.query)
    return {'passages': selected, 'coverage': coverage(document, selected, payload.scope), 'warnings': document.get('warnings', [])}


def is_whole_request(message):
    return bool(re.search(r'\b(?:whole|entire|complete)\s+(?:document|pdf|book|article|text)|\b(?:summari[sz]e|summary of)\s+(?:the |this )?(?:document|pdf|book|article)\b|全体|すべて|要約|全文', message, re.I))


async def source_context(store, document_id=None, content_id=None, script_id=None, query='', scope='focused'):
    chosen = sum(value is not None for value in (document_id, content_id, script_id))
    if chosen > 1:
        raise HTTPException(422, 'Select one source at a time so the lesson does not mix documents.')
    if document_id:
        document = await store.own('speakwise_documents', 'id', document_id)
        chunks = document_chunks(document)
        if not chunks:
            return [], coverage(document, [], scope), 'This PDF has no readable native text. Export a searchable PDF; OCR is not enabled.'
        passages = chunks if scope == 'whole' else lexical_rank(chunks, query)
        info = coverage(document, passages, scope)
        if scope == 'whole':
            passages = await cover_all_passages(passages)
        return passages, info, 'Native PDF text only. Images and table layout have not been interpreted.'
    if script_id:
        script = await store.own('speakwise_scripts', 'id', script_id)
        return [{'sourceId': f'script:{script["id"]}', 'scriptId': script['id'], 'text': script['body'],
                 'kind': script['kind'], 'sourceReferences': script.get('source_refs', [])}], None, ('Canonical VocabStream lesson: words, definitions and examples, selected within this lesson.'
                 if script.get('settings', {}).get('sourceType') == 'vocabstream' else 'Saved reading artifact; its kind distinguishes adaptation from original material.')
    if content_id:
        if re.fullmatch(r'[0-9a-fA-F-]{36}', str(content_id)):
            rows = await store.call('vidmatch_text_content', params={'select': '*', 'id': f'eq.{content_id}', 'limit': '1'})
            if not rows:
                raise HTTPException(404, 'This article is no longer available in the catalog.')
            row = rows[0]
            text = str(row.get('body') or '')
            if not text:
                return [], None, f'Only metadata is available for {row["title"]}. The article body is not indexed.'
            if len(text) > 180000:
                raise HTTPException(422, 'This catalog source exceeds the reading budget. Select a shorter source.')
            chunks = [{'sourceId': f'content:{content_id}:part:{start // 1640 + 1}', 'contentId': str(content_id),
                       'title': row['title'], 'url': row.get('url'), 'text': text[start:start + 1800]} for start in range(0, len(text), 1640)]
            passages = await cover_all_passages(chunks) if scope == 'whole' else lexical_rank(chunks, query)
            return passages, {'scope': scope, 'partsUsed': len(passages), 'totalParts': len(chunks)}, 'Indexed catalog text.'
        videos = await store.call('vidmatch_videos', params={'select': 'video_id,title,description,youtube_url', 'video_id': f'eq.{content_id}', 'limit': '1'})
        if not videos:
            raise HTTPException(404, 'This video is no longer available in the catalog.')
        transcripts = await store.call('vidmatch_transcripts', params={'select': 'id,language_code', 'video_id': f'eq.{content_id}', 'status': 'eq.available', 'limit': '1'})
        if not transcripts:
            return [], None, f'Metadata only: {videos[0]["title"]}. No indexed transcript is available. Description: {str(videos[0].get("description") or "")[:1000]}'
        rows = await store.call('vidmatch_transcript_chunks', params={'select': 'chunk_id,text,start_ms,end_ms',
            'video_id': f'eq.{content_id}', 'transcript_id': f'eq.{transcripts[0]["id"]}', 'order': 'chunk_index.asc', 'limit': '501'})
        if len(rows) > 500 or sum(len(row['text']) for row in rows) > 180000:
            raise HTTPException(422, 'This transcript exceeds the lesson reading budget. Choose a shorter resource.')
        chunks = [{'sourceId': f'transcript:{row["chunk_id"]}', 'contentId': str(content_id), 'text': row['text'],
                   'startMs': row['start_ms'], 'endMs': row['end_ms'], 'title': videos[0]['title'],
                   'url': videos[0].get('youtube_url')} for row in rows]
        return (await cover_all_passages(chunks) if scope == 'whole' else lexical_rank(chunks, query)), None, 'Indexed transcript only; visual video content has not been inspected.'
    return [], None, 'No source selected.'


async def model_json(policy, data, max_tokens=1600):
    # Late import avoids circular router registration while preserving the existing
    # provider implementation, cancellation, deadlines and metrics.
    from main import json_chat_completion
    raw = await json_chat_completion(policy + f'\nPrompt version: {PROMPT_VERSION}', json.dumps(data, ensure_ascii=False), max_tokens)
    try:
        result = json.loads(raw)
    except (ValueError, TypeError):
        raise HTTPException(502, 'The AI returned an invalid response. Please retry; nothing was saved.') from None
    if not isinstance(result, dict):
        raise HTTPException(502, 'The AI returned an invalid response. Please retry; nothing was saved.')
    return result


async def cover_all_passages(passages):
    if sum(len(passage['text']) for passage in passages) <= 24000:
        return passages
    batches, batch, size = [], [], 0
    for passage in passages:
        if batch and size + len(passage['text']) > 22000:
            batches.append(batch)
            batch, size = [], 0
        batch.append(passage)
        size += len(passage['text'])
    if batch:
        batches.append(batch)
    if len(batches) > 12:
        raise HTTPException(422, 'A whole-source summary exceeds the coverage budget. Split this source into smaller documents.')
    semaphore = asyncio.Semaphore(2)
    async def summarize(items):
        async with semaphore:
            output = await model_json(COVERAGE_POLICY, {'passages': items}, max_tokens=2400)
        notes = output.get('notes')
        allowed = {item['sourceId'] for item in items}
        if not isinstance(notes, list) or {note.get('sourceId') for note in notes if isinstance(note, dict)} != allowed:
            raise HTTPException(502, 'The source summary did not cover every supplied page. Please retry or ask a focused question.')
        sources = {item['sourceId']: item for item in items}
        result = []
        for note in notes:
            if not isinstance(note.get('summary'), str) or not 1 <= len(note['summary']) <= 2000:
                raise HTTPException(502, 'The source summary exceeded its safe format. Please ask a focused question.')
            source = sources[note['sourceId']]
            result.append({**source, 'text': note['summary'], 'representation': 'generated_page_notes',
                           'originalExcerpt': source['text'][:600]})
        return result
    try:
        async with asyncio.timeout(100):
            nested = await asyncio.gather(*(summarize(batch) for batch in batches))
    except TimeoutError:
        raise HTTPException(504, 'Whole-document coverage took too long. Retry or ask a focused question.') from None
    result = [item for items in nested for item in items]
    if sum(len(item['text']) for item in result) > 45000:
        raise HTTPException(422, 'Complete source notes exceed the lesson context budget. Ask a focused question or split the source.')
    return result


def citations_for(ids, sources):
    by_id = {source['sourceId']: source for source in sources}
    if any(source_id not in by_id for source_id in ids):
        raise HTTPException(502, 'The AI supplied an unsupported source reference. Please retry; nothing was saved.')
    result = []
    for source_id in dict.fromkeys(ids):
        source = by_id[source_id]
        result.append({key: value for key, value in {**source,
            'excerpt': source.get('originalExcerpt', source['text'])[:600]}.items()
            if key in {'sourceId', 'documentId', 'page', 'contentId', 'scriptId', 'title', 'url', 'startMs', 'endMs', 'excerpt', 'representation'}})
    return result


def bounded_metadata(metadata):
    if len(json.dumps(metadata, ensure_ascii=False).encode()) > 22000:
        for citation in metadata.get('citations', []):
            citation['excerpt'] = citation.get('excerpt', '')[:80]
    if len(json.dumps(metadata, ensure_ascii=False).encode()) > 22000:
        raise HTTPException(502, 'The response contains too many source references to save safely. Ask a more focused question.')
    return metadata


@router.get('/api/learning/scripts')
async def list_scripts(request: Request, offset: int = Query(default=0, ge=0, le=100000), user_id=Depends(authorize_request)):
    rows = await Store(request, user_id).call('speakwise_scripts', params={'select': '*', 'user_id': f'eq.{user_id}',
        'order': 'created_at.desc,id.desc', 'limit': '101', 'offset': str(offset)})
    return {'scripts': [public_script(row) for row in rows[:100]], 'limit': 100,
            'nextOffset': offset + 100 if len(rows) > 100 else None}


@router.get('/api/learning/scripts/{script_id}')
async def get_script(script_id: UUID, request: Request, user_id=Depends(authorize_request)):
    return {'script': public_script(await Store(request, user_id).own('speakwise_scripts', 'id', script_id))}


@router.post('/api/learning/script')
async def create_script(payload: ScriptInput, request: Request, user_id=Depends(authorize_request)):
    store = Store(request, user_id)
    fingerprint = request_fingerprint(payload)
    existing = await store.call('speakwise_scripts', params={'select': '*', 'user_id': f'eq.{user_id}', 'request_id': f'eq.{payload.requestId}', 'limit': '1'})
    if existing:
        require_matching_request(existing[0].get('settings', {}).get('_requestFingerprint'), fingerprint)
        return {'script': public_script(existing[0]), 'reused': True}
    if payload.sessionId:
        await store.own('speakwise_lesson_sessions', 'id', payload.sessionId)
    if not payload.documentId and not payload.contentId and not payload.topic.strip():
        raise HTTPException(422, 'Choose a source or enter a topic for your reading script.')
    if payload.kind == 'original' and (payload.documentId or payload.contentId):
        raise HTTPException(422, 'Use adaptation or excerpt for source-based reading; choose a topic for original material.')
    if payload.kind == 'excerpt' and not (payload.documentId or payload.contentId):
        raise HTTPException(422, 'A faithful excerpt requires a selected source.')
    kind = payload.kind if payload.documentId or payload.contentId else 'original'
    try:
        sources, source_coverage, availability = await source_context(store, document_id=payload.documentId,
            content_id=payload.contentId, query=payload.topic or 'main ideas', scope='focused')
        if (payload.documentId or payload.contentId) and not sources:
            raise HTTPException(422, availability)
        settings = payload.model_dump(mode='json', exclude={'requestId', 'sessionId'})
        settings['targetLanguage'] = 'en'
        # Excerpts are copied by the application, never entrusted to generation.
        excerpt = ''
        if kind == 'excerpt':
            excerpt = ' '.join(sources[0]['text'].split()[:payload.lengthWords])
        output = ScriptOutput.model_validate(await model_json(SCRIPT_POLICY, {'settings': {**settings, 'kind': kind},
            'sources': sources, 'coverage': source_coverage, 'availability': availability,
            'verbatimBody': excerpt or None,
            'excerptInstruction': 'When verbatimBody is supplied, copy it exactly and base all questions only on that body.'}, max_tokens=3200))
        refs = citations_for(output.sourceIds, sources)
        if sources and not refs:
            raise HTTPException(502, 'The source-based script did not identify its evidence. Please retry.')
        if excerpt:
            output.body = excerpt
            refs = citations_for([sources[0]['sourceId']], sources)
        record = {'id': str(uuid5(UUID(user_id), str(payload.requestId))), 'user_id': user_id,
            'session_id': str(payload.sessionId) if payload.sessionId else None, 'request_id': str(payload.requestId),
            'title': output.title, 'body': output.body, 'kind': kind, 'source_refs': refs,
            'settings': {**settings, 'kind': kind, 'coverage': source_coverage, '_requestFingerprint': fingerprint},
            'questions': [question.model_dump() for question in output.questions], 'vocabulary': output.vocabulary,
            'prompt_version': PROMPT_VERSION, 'schema_version': SCHEMA_VERSION}
        saved = await store.call('speakwise_scripts', 'POST', params={'on_conflict': 'user_id,request_id'}, data=record,
                                 prefer='resolution=ignore-duplicates,return=representation')
        if not saved:
            saved = [await store.own('speakwise_scripts', 'request_id', payload.requestId)]
            require_matching_request(saved[0].get('settings', {}).get('_requestFingerprint'), fingerprint)
        return {'script': public_script(saved[0]), 'reused': False}
    except HTTPException:
        raise
    except (ValidationError, ValueError):
        raise HTTPException(502, 'The generated script did not meet its format. Please retry; nothing was saved.') from None
    except Exception as exc:
        from main import provider_error
        return provider_error(exc, 'script_generation')


def validate_observations(proposed, messages, sources):
    messages_by_id = {str(message['id']): message for message in messages if message.get('role') == 'user'}
    nonlearner_text = '\n'.join(source['text'] for source in sources) + '\n' + '\n'.join(
        message['content'] for message in messages if message.get('role') == 'assistant')
    results = []
    for observation in proposed:
        message = messages_by_id.get(str(observation.evidenceMessageId))
        if not message or observation.original not in message['content'] or observation.original == observation.correction:
            continue
        metadata = message.get('metadata') or {}
        if metadata.get('inputMethod') in {'speech', 'recognition'} or metadata.get('speechRecognition'):
            continue
        if observation.original in nonlearner_text or re.search(r'["“”]|^\s*>', message['content'], re.M):
            continue
        results.append({**observation.model_dump(mode='json'), 'origin': 'model_inferred',
                        'confidence': .6, 'observedAt': message.get('created_at')})
    return results


async def learner_context(store, query):
    profiles = await store.call('speakwise_learner_profiles', params={'select': 'preferences,memory_reset_at,memory_enabled',
        'user_id': f'eq.{store.user_id}', 'limit': '1'})
    profile = profiles[0] if profiles else {}
    if profile.get('memory_enabled') is False:
        return {'confirmedPreferences': profile.get('preferences', {}), 'historicalEvidence': [], 'memoryEnabled': False}
    # One shared full-corpus lexical SQL shortlist serves Next and Python. Hard
    # ownership and reset cutoffs are enforced before any rows reach the model.
    result = await store.call('rpc/retrieve_speakwise_memory', 'POST', data={'p_user_id': store.user_id,
        'p_query': query, 'p_since': profile.get('memory_reset_at')})
    summaries = result.get('summaries', [])
    events = result.get('events', [])
    now = datetime.now(timezone.utc)
    word_evidence = {}
    for attempt in result.get('canonicalAttempts', []):
        if not attempt.get('word'):
            continue
        try:
            observed = datetime.fromisoformat(attempt['answered_at'].replace('Z', '+00:00'))
        except (ValueError, KeyError):
            continue
        if observed > now:
            continue
        recency = math.exp(-(now - observed).total_seconds() / 86400 / 90)
        category = str(attempt.get('source_category') or '')
        if not category:
            # Older outcomes without a category cannot safely establish recovery
            # for a particular meaning of a word (for example a river vs bank).
            continue
        word = (str(attempt['word']).casefold(), category)
        value = word_evidence.setdefault(word, {'word': attempt['word'], 'sourceCategory': category,
            'weightedSuccesses': 0.0, 'weightedFailures': 0.0, 'evidenceIds': []})
        if attempt.get('is_correct') is True and attempt.get('hint_used') is not True:
            value['weightedSuccesses'] += recency
        elif attempt.get('is_correct') is False:
            value['weightedFailures'] += recency
        value['evidenceIds'].append(attempt['id'])
    wanted = set(tokens(query))
    ranked = []
    for row in summaries:
        try:
            observed = datetime.fromisoformat(row['created_at'].replace('Z', '+00:00'))
        except (ValueError, KeyError):
            continue
        if observed > now:
            continue
        summary = row.get('summary', {})
        text = json.dumps(summary, ensure_ascii=False)
        words = set(tokens(text))
        relevance = len(words & wanted) / max(len(wanted), 1)
        recency = math.exp(-(now - observed).total_seconds() / 86400 / 90)
        # Vocabulary evidence changes urgency, while stale conversation-only
        # inferences remain dated and tentative rather than becoming permanent.
        senses = {(str(activity.get('word', '')).casefold(), str(activity.get('sourceCategory', '')))
            for activity in summary.get('activities', []) if isinstance(activity, dict)
            and activity.get('type') == 'vocabulary_attempt' and activity.get('word') and activity.get('sourceCategory')}
        matching = [word_evidence[sense] for sense in senses if sense in word_evidence]
        failures = sum(value['weightedFailures'] for value in matching)
        successes = sum(value['weightedSuccesses'] for value in matching)
        unresolved = failures / (failures + successes * 1.5 + 1) if failures else 0
        score = 4 * relevance + .55 * recency + .6 * (.25 + unresolved)
        excerpt, truncated = context_excerpt(text, query, 2800)
        ranked.append({'summaryId': row['id'], 'createdAt': row.get('created_at'), 'text': excerpt,
                       'excerpted': truncated, 'score': round(score, 4)})
    ranked.sort(key=lambda row: row['score'], reverse=True)
    relevant, seen = [], set()
    for row in ranked:
        fingerprint = ' '.join(row['text'].casefold().split())[:220]
        if fingerprint not in seen:
            relevant.append(row)
            seen.add(fingerprint)
        if len(relevant) >= 5:
            break
    # Keep newest verified outcomes visible alongside old relevant summaries;
    # never represent an old weakness as current merely because it matches query.
    recent_events = [{'id': row['id'], 'eventType': row['event_type'], 'createdAt': row['created_at'],
        'payloadExcerpt': context_excerpt(json.dumps(row.get('payload', {}), ensure_ascii=False), query, 1200)[0]}
        for row in sorted(events, key=lambda item: item.get('created_at', ''), reverse=True)[:8]]
    return {'confirmedPreferences': profile.get('preferences', {}),
            'historicalEvidence': relevant, 'vocabularyEvidence': list(word_evidence.values())[:12],
            'recentOutcomes': recent_events, 'retrieval': 'shared_full_corpus_lexical_shortlist',
            'recoveryRule': 'Only outcomes for the same word and sourceCategory can reduce vocabulary urgency. '
                'Unknown-sense legacy weaknesses and grammar inferences have no scored recovery conclusion. '
                'One success is insufficient to establish mastery.'}


def context_excerpt(text, query, limit):
    """A declared, task-centered memory/chat excerpt; originals remain persisted."""
    if len(text) <= limit:
        return text, False
    folded = text.casefold()
    positions = [folded.find(token) for token in tokens(query) if len(token) >= 3 and token in folded]
    start = max(0, min(positions) - limit // 4) if positions else 0
    start = min(start, len(text) - limit)
    return text[start:start + limit], True


@router.post('/api/learning/chat')
async def learning_chat(payload: ChatInput, request: Request, user_id=Depends(authorize_request)):
    store = Store(request, user_id)
    fingerprint = request_fingerprint(payload)
    session = await store.own('speakwise_lesson_sessions', 'id', payload.sessionId)
    if session.get('status') == 'completed':
        raise HTTPException(409, 'This lesson is complete. Start a new lesson to continue.')
    message_id = str(uuid5(payload.sessionId, str(payload.requestId)))
    prior = await store.call('speakwise_lesson_messages', params={'select': '*', 'user_id': f'eq.{user_id}',
        'session_id': f'eq.{payload.sessionId}', 'id': f'eq.{message_id}', 'limit': '1'})
    if prior:
        require_matching_request(prior[0].get('metadata', {}).get('requestFingerprint'), fingerprint)
        return {'reply': prior[0]['content'], 'messageId': message_id, **(prior[0].get('metadata') or {}), 'reused': True}
    messages, limited = await store.all_own('speakwise_lesson_messages', {'session_id': f'eq.{payload.sessionId}', 'order': 'created_at.asc'}, cap=1000)
    if limited:
        raise HTTPException(422, 'This lesson reached its saved-message budget. Complete it and start a new lesson.')
    # User message must already be durably saved so refresh and summary can rely
    # on the same evidence. Starting instructions are allowed on an empty lesson.
    if messages and not any(message['role'] == 'user' and message['content'] == payload.message for message in messages[-5:]):
        raise HTTPException(409, 'Save your message before requesting a reply. Retry the send action.')
    try:
        scope = payload.scope or ('whole' if is_whole_request(payload.message) else 'focused')
        sources, source_coverage, availability = await source_context(store, payload.documentId,
            payload.contentId, payload.scriptId, payload.message, scope)
        unavailable_source = bool(payload.documentId or payload.contentId or payload.scriptId) and not sources
        context = {'historicalEvidence': []} if unavailable_source else await learner_context(store, payload.message)
        recent, context_size = [], 0
        for message in reversed(messages[-16:]):
            excerpt, truncated = context_excerpt(message['content'], payload.message, 4000)
            if context_size + len(excerpt) > 24000:
                break
            recent.insert(0, {key: message[key] for key in ('id', 'role', 'created_at') if key in message} |
                          {'content': excerpt, 'excerpted': truncated})
            context_size += len(excerpt)
        recent_ids = {message['id'] for message in recent}
        earlier = [{'sourceId': message['id'], 'text': message['content'], 'record': message}
                   for message in messages if message['id'] not in recent_ids]
        relevant_earlier = []
        for item in lexical_rank(earlier, payload.message, limit=4) if earlier else []:
            record = item['record']
            excerpt, truncated = context_excerpt(record['content'], payload.message, 1800)
            relevant_earlier.append({key: record[key] for key in ('id', 'role', 'created_at') if key in record} |
                                    {'content': excerpt, 'excerpted': truncated})
        from main import LESSON_MODE_PROMPTS
        lesson_mode = session.get('lesson_mode', payload.lessonMode)
        if lesson_mode not in LESSON_MODE_PROMPTS:
            lesson_mode = 'natural_conversation'
        mode = LESSON_MODE_PROMPTS[lesson_mode]
        planned_minutes = max(1, min(180, int(session.get('planned_duration_minutes') or 15)))
        elapsed_seconds = max(0, int(session.get('elapsed_seconds') or 0))
        settings = {'level': session.get('level', payload.level), 'targetLanguage': 'en',
                    'lessonMode': lesson_mode, 'modeName': mode['name'], 'modeWorkflow': mode['workflow'],
                    'topics': session.get('selected_topics', payload.topics),
                    'durationMinutes': planned_minutes, 'elapsedSeconds': elapsed_seconds,
                    'remainingMinutes': max(0, round(planned_minutes - elapsed_seconds / 60, 1)),
                    'phase': 'start' if not messages else 'continue', 'state': session.get('state', {})}
        policy = GROUNDED_CHAT_POLICY + '\nCurrent focused lesson workflow: ' + mode['workflow'] + '''
Honor the persisted current objective and remainingMinutes. Near the planned end,
offer a short wrap-up; do not start a long new activity without a learner request.
Optional observations: at most two {type: grammar|vocabulary|expression,
original, correction, explanation, evidenceMessageId} objects. Use exact original
substrings only from the learner's own persisted messages, never quoted source,
assistant examples or uncertain speech recognition. These are tentative inferences,
not demonstrated improvement. Use an empty array when evidence is insufficient.'''
        if unavailable_source:
            # Missing source contents are an application state, not a prompt-only
            # suggestion: do not ask a model to invent a replacement summary.
            output = ChatOutput(reply=availability + ' Choose a readable source or use an original topic-based activity.')
        else:
            output = ChatOutput.model_validate(await model_json(policy, {'settings': settings, 'memory': context,
                'recentMessages': recent, 'relevantEarlierMessages': relevant_earlier,
                'omittedMessageCount': len(messages) - len(recent) - len(relevant_earlier), 'message': payload.message,
                'sourcePassages': sources, 'coverage': source_coverage, 'availability': availability}, max_tokens=1800))
        citations = citations_for(output.sourceIds, sources)
        action = output.action.model_dump() if output.action else None
        reply = output.reply
        if action and action['type'] != 'open_materials':
            reply = {'search_content': 'I can search the VidMatch catalog for this lesson.',
                     'practice_vocabulary': 'I can open a short vocabulary activity in this lesson.',
                     'create_script': 'I can create and save a reading script with the selected source and settings.'}[action['type']]
        elif not unavailable_source and re.search(r"\b(?:I(?:'ve| have)?|we(?:'ve| have)?)\s+(?:successfully\s+)?(?:saved|searched|opened|updated|recorded|created)\b|\b(?:has been|was|is now)\s+(?:successfully\s+)?(?:saved|opened|updated|recorded)\b|保存しました|保存済み|検索しました|更新しました|已保存|已搜索|ya (?:guardé|he guardado)", reply, re.I):
            raise HTTPException(502, 'The tutor described an unconfirmed action. Use the lesson action controls or try again.')
        if not unavailable_source and re.search(r'\b(?:page|p\.)\s*\d+|https?://|\[\d+:\d+\]', reply, re.I):
            raise HTTPException(502, 'The response included an unverified inline reference. Please retry; verified references appear separately.')
        observations = validate_observations(output.observations, messages, sources)
        metadata = bounded_metadata({'citations': citations, 'coverage': source_coverage, 'action': action,
                    'observations': observations, 'promptVersion': PROMPT_VERSION, 'schemaVersion': SCHEMA_VERSION,
                    'sourceAvailability': availability, 'requestFingerprint': fingerprint,
                    'requestContext': payload.model_dump(mode='json', exclude={'message', 'requestId', 'sessionId'})})
        saved = await store.call('speakwise_lesson_messages', 'POST', params={'on_conflict': 'id'},
            data={'id': message_id, 'user_id': user_id, 'session_id': str(payload.sessionId),
                  'role': 'assistant', 'content': reply, 'metadata': metadata},
            prefer='resolution=ignore-duplicates,return=representation')
        if not saved:
            row = await store.own('speakwise_lesson_messages', 'id', message_id)
            require_matching_request(row.get('metadata', {}).get('requestFingerprint'), fingerprint)
            return {'reply': row['content'], 'messageId': message_id, **(row.get('metadata') or {}), 'reused': True}
        logger.info(json.dumps({'event': 'learning_context', 'session_id': str(payload.sessionId),
            'source_count': len(sources), 'memory_count': len(context.get('historicalEvidence', [])),
            'context_chars': sum(len(source['text']) for source in sources), 'prompt_version': PROMPT_VERSION}))
        return {'reply': reply, 'messageId': message_id, **metadata, 'reused': False}
    except HTTPException:
        raise
    except (ValidationError, ValueError):
        raise HTTPException(502, 'The tutor response did not meet the learning contract. Please retry; nothing was saved.') from None
    except Exception as exc:
        from main import provider_error
        return provider_error(exc, 'learning_generation')
