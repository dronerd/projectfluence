from functools import lru_cache
import os
import asyncio
from contextlib import asynccontextmanager
import time
import json
import logging
from pathlib import Path
import re
import secrets
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from openai import AsyncOpenAI, APITimeoutError, BadRequestError, RateLimitError
import httpx
from contracts import ChatRequest, FeedbackRequest, VoiceRequest
from security import auth_client, authorize_request, install_request_guards, request_id
from prompts import PROMPT_VERSION, SUMMARY_POLICY, TUTOR_POLICY

load_dotenv(Path(__file__).with_name(".env"))
load_dotenv()

@asynccontextmanager
async def lifespan(app):
    yield
    if get_openai_client.cache_info().currsize:
        await get_openai_client().close()
        get_openai_client.cache_clear()
    if auth_client.cache_info().currsize:
        await auth_client().aclose()
        auth_client.cache_clear()


app = FastAPI(title="SpeakWise API", version="2.0.0", lifespan=lifespan)
install_request_guards(app)
logger = logging.getLogger("speakwise")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
logger.propagate = False

LEVEL_POSITIVE_FALLBACK_PROMPTS = {
    "A1": [
        "Great effort. Your answer gives us a good place to start.",
        "Nice try. You shared your idea clearly enough to practice from here.",
        "Good work. I can see what you want to say.",
    ],
    "A2": [
        "Good effort. Your answer gives us a clear starting point.",
        "Nice work. You expressed your idea, and now we can make it stronger.",
        "Well done. Your response has a useful idea to build on.",
    ],
    "B1": [
        "Good effort. Your answer gives us a clear base to improve.",
        "Nice response. You communicated your main idea, and we can refine it now.",
        "Well done. There is a clear thought here that we can develop further.",
    ],
    "B2": [
        "Good work. Your answer has a clear direction, and we can sharpen it further.",
        "Nice effort. You have a solid starting point for more natural expression.",
        "Well done. Your response gives us useful content to polish.",
    ],
    "C1": [
        "Strong effort. Your answer gives us meaningful material to refine.",
        "Good response. You have a clear line of thought, and we can make it more precise.",
        "Nice work. Your idea is developed enough for targeted feedback.",
    ],
    "C2": [
        "Strong effort. Your response gives us rich material to polish with precision.",
        "Good work. Your answer has substance, and we can refine its nuance.",
        "Nice response. There is a clear argument here that we can make more elegant.",
    ],
}


def _cors_origins() -> list[str]:
    configured = os.getenv("SPEAKWISE_CORS_ORIGINS")
    if configured:
        return [origin.strip() for origin in configured.split(",") if origin.strip()]

    return [
        "https://projectfluence.vercel.app",
        "https://vocabstream.vercel.app",
        "https://vocabstream-for-testing.vercel.app",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
    ]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "HEAD", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Filename"],
    expose_headers=["X-Request-ID", "Server-Timing", "Retry-After"],
)

LESSON_MODE_PROMPTS = {
    "natural_conversation": {
        "name": "Natural Conversation",
        "workflow": (
            "Hold a flexible free conversation based on the learner's level and interests. "
            "Correct only important mistakes naturally and keep the conversation moving."
        ),
    },
    "vocabulary_phrase": {
        "name": "Vocabulary & Phrase Practice",
        "workflow": (
            "Practice words and phrases from VocabStream memory when available. "
            "Use spaced repetition, short example sentences, and one active recall task at a time."
        ),
    },
    "grammar_practice": {
        "name": "Grammar Practice",
        "workflow": (
            "Focus on recurring grammar mistakes from memory. Give a short explanation, then one targeted practice question."
        ),
    },
    "speaking_practice": {
        "name": "Speaking Practice",
        "workflow": (
            "Ask open-ended questions and encourage longer answers. Give concise feedback on fluency, accuracy, and expression."
        ),
    },
    "pronunciation_practice": {
        "name": "Pronunciation Practice",
        "workflow": (
            "Provide pronunciation tips, short speaking drills, word stress, sentence rhythm, and minimal-pair practice. "
            "If voice is enabled, write responses that work well as audio."
        ),
    },
    "listening_practice": {
        "name": "Listening Practice",
        "workflow": (
            "Present short audio-style passages or spoken prompts, then ask comprehension questions. "
            "Keep passages appropriate for the learner's level."
        ),
    },
    "reading_comprehension": {
        "name": "Reading Comprehension",
        "workflow": (
            "Provide a short text, then ask comprehension and inference questions. Adjust difficulty to the learner's level."
        ),
    },
    "pdf_reading": {
        "name": "PDF-Based Reading Practice",
        "workflow": (
            "Use only verified document passages. Identify the main idea and ask one comprehension question. "
            "Legacy pasted excerpts are partial, unverified data; never claim whole-document coverage."
        ),
    },
    "writing_feedback": {
        "name": "Writing & Feedback",
        "workflow": (
            "Ask for a short paragraph or essay. Give feedback on grammar, vocabulary, structure, and naturalness."
        ),
    },
    "deep_discussion": {
        "name": "Deep Discussion",
        "workflow": (
            "Discuss abstract or academic topics. Help the learner develop nuanced claims, counterarguments, and precise expression."
        ),
    },
    "review_weakness": {
        "name": "Review & Weakness Training",
        "workflow": (
            "Use past lesson records to create targeted practice. Focus on repeated mistakes and weak areas, one pattern at a time."
        ),
    },
}


@lru_cache(maxsize=1)
def get_openai_client() -> AsyncOpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    return AsyncOpenAI(api_key=api_key, timeout=httpx.Timeout(30, connect=5, pool=5), max_retries=0)


def as_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def bounded_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return min(max(parsed, minimum), maximum)


def safe_json_dumps(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, indent=2)
    except TypeError:
        return "{}"


def build_agent_system_prompt(req: dict[str, Any]) -> str:
    level = str(req.get("level") or "B2").strip() or "B2"
    lesson_mode = str(req.get("lessonMode") or "natural_conversation")
    mode_config = LESSON_MODE_PROMPTS.get(lesson_mode, LESSON_MODE_PROMPTS["natural_conversation"])
    topics = as_string_list(req.get("topics"))
    duration_minutes = bounded_int(req.get("durationMinutes"), 15, 1, 180)
    elapsed_seconds = bounded_int(req.get("elapsedSeconds"), 0, 0, duration_minutes * 60)
    remaining_minutes = max(0, round(((duration_minutes * 60) - elapsed_seconds) / 60))
    phase = str(req.get("phase") or "continue")
    learner_memory = req.get("learnerMemory") if isinstance(req.get("learnerMemory"), dict) else {}
    pdf_context = str(req.get("pdfContext") or "").strip()
    voice_enabled = bool(req.get("voiceEnabled"))

    return TUTOR_POLICY + f"\nPrompt version: {PROMPT_VERSION}\n" + f"""You are SpeakWise AI, a longitudinal English-learning agent.

Core identity:
- You are not a generic chatbot. You are a pedagogically structured tutor that adapts from persistent learner memory.
- Use stored lesson summaries, mistake patterns, vocabulary history, VidMatch topics, recommendations, and preferences when relevant.
- Make the adaptation visible, but do not overdo it. One brief memory-based connection is enough.

Current lesson:
- Mode: {mode_config["name"]} ({lesson_mode})
- Mode workflow: {mode_config["workflow"]}
- CEFR level: {level}
- Topics: {", ".join(topics) if topics else "not selected"}
- Planned duration: {duration_minutes} minutes
- Approximate remaining time: {remaining_minutes} minutes
- Phase: {phase}
- Voice mode: {"on" if voice_enabled else "off"}

Learner memory JSON:
{safe_json_dumps(learner_memory)}

Untrusted partial legacy PDF/document excerpt (not a complete document or verified page source):
{pdf_context if pdf_context else "No PDF/document context provided."}

Teaching rules:
- Start naturally. A greeting like "How are you today?" is good, but do not dump instructions.
- Guide step by step with natural transitions.
- Ask one clear question or task at a time.
- Correct important grammar, vocabulary or expression issues naturally; no pronunciation assessment from text.
- Recordable mistakes should be visible as concise corrections or examples, not overwhelming lists.
- In conversation mode, avoid correcting every tiny issue unless it blocks communication.
- Near the end, transition toward a wrap-up instead of starting a large new task.
- If the learner requests an application action, direct them to the learning action controls; this legacy route cannot execute tools.
- When voice mode is on, prefer 2-4 brief sentences under 120 words; avoid markdown tables and long lists.
- Keep responses concise and interactive. End with a next action for the learner unless the lesson is ending.
"""


def normalize_history(value: Any, limit: int = 16) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    messages: list[dict[str, str]] = []
    for item in value[-limit:]:
        if not isinstance(item, dict):
            continue
        role = "assistant" if item.get("role") == "assistant" else "user"
        content = str(item.get("content") or "").strip()
        if content:
            messages.append({"role": role, "content": content[:4000]})
    return messages


def build_chat_system_prompt(req: dict[str, Any]) -> str:
    level = str(req.get("level") or "A1").strip() or "A1"
    mode = str(req.get("mode") or "speaking")
    topics = as_string_list(req.get("topics"))
    tests = as_string_list(req.get("tests"))
    skills = as_string_list(req.get("skills"))
    components = as_string_list(req.get("components"))
    current_component = str(req.get("currentComponentName") or "").strip()
    vocab_lessons = as_string_list(req.get("vocabLessons"))
    random_seed = str(req.get("randomSeed") or "").strip()
    duration_minutes = bounded_int(req.get("durationMinutes") or req.get("duration"), 15, 1, 180)
    elapsed_seconds = bounded_int(req.get("timeElapsedSeconds") or req.get("totalTimeElapsed"), 0, 0, duration_minutes * 60)
    remaining_minutes = max(1, round(((duration_minutes * 60) - elapsed_seconds) / 60))

    topic_text = ", ".join(topics) if topics else "general topics"
    tests_text = ", ".join(tests) if tests else "General English"
    skills_text = ", ".join(skills) if skills else "general English"
    components_text = ", ".join(components) if components else "general practice"
    vocab_text = ", ".join(vocab_lessons) if vocab_lessons else "not specified"

    if mode == "lesson":
        practice_context = f"""
Practice context:
- Practice format: guided writing lesson
- Duration: {duration_minutes} minutes
- Approximate remaining time: {remaining_minutes} minutes
- Selected components: {components_text}
- Current component: {current_component or "general practice"}
- Vocabulary category: {req.get("vocabCategory") or "not selected"}
- Vocabulary lessons, already randomized by the frontend: {vocab_text}
- Random seed for varying vocabulary, phrasing, and questions: {random_seed or "not provided"}
"""
    else:
        practice_context = """
Practice context:
- Practice format: speaking practice or practice-question generation
"""

    return TUTOR_POLICY + f"\nPrompt version: {PROMPT_VERSION}\n" + f"""You are SpeakWise, a warm and precise English tutor.

Student profile:
- CEFR level: {level}
- Topics of interest: {topic_text}
- Target tests: {tests_text}
- Target skills: {skills_text}
{practice_context}
Follow the user's latest instruction closely. The frontend sends the exact lesson or practice task in the user message, so do not replace it with a separate backend lesson flow.

Teaching style:
- Match vocabulary and sentence complexity to the student's CEFR level.
- Keep responses concise enough for an interactive chat.
- Be friendly, encouraging, and specific.
- Ask one clear next question or task when the message calls for continued practice.
- If the user asks for only a question, JSON, or another strict format, return only that format."""


async def complete(messages, max_tokens, temperature=0.7, response_format=None) -> str:
    """Collect a streamed text reply while measuring actual provider TTFT.

    Text remains one JSON response; sentence-level speech is intentionally not
    synthesized independently because it can introduce gaps/prosody changes.
    """
    started = time.monotonic()
    first_ms = None
    options = {"response_format": response_format} if response_format else {}
    async with asyncio.timeout(45):
        stream = await get_openai_client().chat.completions.create(
            model=os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini"), messages=messages,
            temperature=temperature, max_tokens=max_tokens, stream=True, **options,
        )
        parts = []
        try:
            async for chunk in stream:
                content = chunk.choices[0].delta.content if chunk.choices else None
                if content:
                    if first_ms is None:
                        first_ms = round((time.monotonic() - started) * 1000, 1)
                    parts.append(content)
        finally:
            await stream.close()
    logger.info(json.dumps({"event": "llm_complete", "request_id": request_id.get(), "first_token_ms": first_ms,
        "total_ms": round((time.monotonic() - started) * 1000, 1)}))
    result = "".join(parts).strip()
    if not result:
        raise RuntimeError("Empty provider response")
    return result


async def chat_completion(system_prompt: str, message: str, max_tokens: int) -> str:
    return await complete([{"role": "system", "content": system_prompt},
        {"role": "user", "content": message}], max_tokens)


async def agent_chat_completion(system_prompt: str, req: dict[str, Any], max_tokens: int) -> str:
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(normalize_history(req.get("history")))
    messages.append({"role": "user", "content": str(req.get("message") or "").strip()})
    return await complete(messages, max_tokens, temperature=0.65)


async def json_chat_completion(system_prompt: str, message: str, max_tokens: int) -> str:
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": message}]
    try:
        return await complete(messages, max_tokens, temperature=0.45, response_format={"type": "json_object"})
    except BadRequestError as exc:
        # Only a deterministic unsupported-format error warrants a second call.
        if exc.param != "response_format":
            raise
        logger.warning(json.dumps({"event": "json_format_unsupported"}))
        return await chat_completion(system_prompt, message, max_tokens)


def provider_error(exc: Exception, stage: str) -> JSONResponse:
    status = 504 if isinstance(exc, (TimeoutError, APITimeoutError)) else 503 if isinstance(exc, RateLimitError) else 502
    logger.warning(json.dumps({"event": "provider_failed", "request_id": request_id.get(), "stage": stage, "type": type(exc).__name__}))
    return JSONResponse({"error": "The AI service is temporarily unavailable. Please try again.", "code": "provider_unavailable"}, status_code=status)


@app.api_route("/health", methods=["GET", "HEAD"])
def health() -> Response:
    return Response(status_code=200)


@app.post("/api/chat", dependencies=[Depends(authorize_request)])
async def chat(payload: ChatRequest) -> JSONResponse:
    req = payload.model_dump()
    mode = str(req.get("mode") or "speaking")
    if mode == "warmup":
        return JSONResponse({"status": "ok", "mode": "warmup"})

    if mode not in {"speaking", "lesson", "agent"}:
        return JSONResponse({"error": "Unknown mode. Use 'speaking', 'lesson', 'agent', or 'warmup'."}, status_code=400)

    message = str(req.get("message") or "").strip()
    if not message:
        return JSONResponse({"error": "message is required"}, status_code=400)

    try:
        if mode == "agent":
            reply = await agent_chat_completion(build_agent_system_prompt(req), req, max_tokens=850)
        else:
            max_tokens = 700 if mode == "lesson" else 500
            reply = await chat_completion(build_chat_system_prompt(req), message, max_tokens=max_tokens)
        return JSONResponse({"reply": reply, "mode": mode})
    except Exception as exc:
        return provider_error(exc, "generation")


SUMMARY_JSON_SCHEMA = """{
  "title": "Short lesson title",
  "covered": ["What the lesson covered"],
  "strengths": ["What the learner did well"],
  "weaknesses": ["Mistakes or weak areas noticed"],
  "recommendations": ["Recommended next steps"],
  "usefulVocabulary": ["Useful vocabulary or phrases from the lesson"],
  "mistakes": [
    {
      "type": "grammar | vocabulary | pronunciation | expression | fluency | structure",
      "pattern": "Reusable mistake pattern",
      "original": "Learner example if available",
      "correction": "Natural correction",
      "explanation": "Brief explanation"
    }
  ]
}"""


@app.post("/api/lesson-summary", dependencies=[Depends(authorize_request)])
async def lesson_summary(payload: ChatRequest) -> JSONResponse:
    req = payload.model_dump()
    history = normalize_history(req.get("history"), limit=100)
    if not history:
        return JSONResponse({"error": "history is required"}, status_code=400)

    lesson_mode = str(req.get("lessonMode") or "natural_conversation")
    mode_config = LESSON_MODE_PROMPTS.get(lesson_mode, LESSON_MODE_PROMPTS["natural_conversation"])
    level = str(req.get("level") or "B2")
    topics = as_string_list(req.get("topics"))

    prompt = f"""Summarize this SpeakWise lesson for persistent learner memory.

Lesson mode: {mode_config["name"]}
Level: {level}
Topics: {", ".join(topics) if topics else "not selected"}

Conversation:
{safe_json_dumps(history)}

Return ONLY valid JSON with this schema:
{SUMMARY_JSON_SCHEMA}

Rules:
- Be concise and specific.
- Include repeated or pedagogically useful mistakes only.
- Make recommendations usable in the next lesson.
- If there were no clear mistakes, use an empty mistakes array.
"""

    try:
        raw = await json_chat_completion(
            system_prompt=SUMMARY_POLICY + "\nYou produce provisional legacy JSON lesson records. Return only JSON. This browser transcript may be incomplete and is not authoritative evidence of completion.",
            message=prompt,
            max_tokens=1300,
        )
        parsed = parse_json_object(raw)
        if parsed is None:
            raise RuntimeError("Invalid summary response")
        summary = normalize_lesson_summary(parsed)
        summary['limitations'] = ['Legacy browser transcript; use the saved-session completion flow for authoritative records.']
        summary['status'] = 'provisional'
        summary['promptVersion'] = PROMPT_VERSION
        farewell = "Great work today. Here are the main points to review next time."
        return JSONResponse({"summary": summary, "farewell": farewell})
    except Exception as exc:
        return provider_error(exc, "generation")


def normalize_string_list(value: Any, fallback: list[str] | None = None) -> list[str]:
    if not isinstance(value, list):
        return fallback or []
    return [str(item).strip()[:500] for item in value if str(item).strip()][:8]


def normalize_lesson_summary(raw: dict[str, Any]) -> dict[str, Any]:
    mistakes = raw.get("mistakes")
    normalized_mistakes = []
    if isinstance(mistakes, list):
        for mistake in mistakes[:12]:
            if not isinstance(mistake, dict):
                continue
            mistake_type = str(mistake.get("type") or "expression").strip() or "expression"
            normalized_mistakes.append({
                "type": mistake_type[:80],
                "pattern": str(mistake.get("pattern") or mistake.get("explanation") or mistake_type).strip()[:240],
                "original": str(mistake.get("original") or "").strip()[:400],
                "correction": str(mistake.get("correction") or "").strip()[:400],
                "explanation": str(mistake.get("explanation") or "").strip()[:400],
            })

    return {
        "title": str(raw.get("title") or "SpeakWise lesson").strip()[:120],
        "covered": normalize_string_list(raw.get("covered")),
        "strengths": normalize_string_list(raw.get("strengths")),
        "weaknesses": normalize_string_list(raw.get("weaknesses")),
        "recommendations": normalize_string_list(raw.get("recommendations")),
        "usefulVocabulary": normalize_string_list(raw.get("usefulVocabulary") or raw.get("useful_vocabulary")),
        "mistakes": normalized_mistakes,
    }

@app.post("/api/voice", dependencies=[Depends(authorize_request)])
async def voice(payload: VoiceRequest, request: Request):
    started = time.monotonic()
    context = None
    entered = False
    try:
        context = get_openai_client().audio.speech.with_streaming_response.create(
            model=os.getenv("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
            voice=payload.voice, input=payload.text, response_format="mp3",
        )
        # Enter/read before sending HTTP 200 so initial provider errors remain JSON.
        async with asyncio.timeout(30):
            response = await context.__aenter__()
            entered = True
            iterator = response.iter_bytes(chunk_size=4096).__aiter__()
            first = await anext(iterator)
    except BaseException as exc:
        if context is not None and entered:
            await context.__aexit__(type(exc), exc, exc.__traceback__)
        if not isinstance(exc, Exception):
            raise
        return provider_error(exc, "tts")
    first_ms = round((time.monotonic() - started) * 1000, 1)
    logger.info(json.dumps({"event": "tts_first_byte", "request_id": request.state.request_id, "first_byte_ms": first_ms}))

    async def audio_chunks():
        try:
            yield first
            async with asyncio.timeout(60):
                async for chunk in iterator:
                    yield chunk
        except asyncio.CancelledError:
            logger.info(json.dumps({"event": "tts_disconnected", "request_id": request.state.request_id}))
            raise
        except Exception as exc:
            logger.warning(json.dumps({"event": "tts_stream_failed", "request_id": request.state.request_id, "type": type(exc).__name__}))
            raise
        finally:
            await context.__aexit__(None, None, None)
            logger.info(json.dumps({"event": "tts_closed", "request_id": request.state.request_id,
                "total_ms": round((time.monotonic() - started) * 1000, 1)}))

    return StreamingResponse(audio_chunks(), media_type="audio/mpeg", headers={"X-Accel-Buffering": "no"})

# function for building feedback prompt, to be used in the /api/feedback endpoint. 
def build_feedback_prompt(question: str, user_answer: str, level: str, tests: str, skills: str, practice_mode: str) -> str:
    return f"""You are an expert English language teacher providing detailed, constructive feedback.

Student Information:
- CEFR Level: {level}
- Test Focus: {tests}
- Skills Focus: {skills}
- Practice Mode: {practice_mode}

Practice Question:
{question}

Student's Response:
{user_answer}

Analyze the student's response carefully and provide structured feedback in JSON format only.

Respond ONLY with valid JSON (no markdown, no explanation outside the JSON) with this exact structure:
{{
  "positiveComment": "A warm, specific positive comment about the student's answer and topic",
  "overall": "A 1-2 sentence overall assessment of the response",
  "grammar": ["Grammar point 1", "Grammar point 2"],
  "vocabulary": ["Vocabulary suggestion 1", "Vocabulary suggestion 2"],
  "pronunciation": ["Pronunciation tip 1"],
  "fluency": ["Fluency observation 1", "Fluency observation 2"],
  "suggestions": ["Actionable suggestion 1", "Actionable suggestion 2"]
}}

Rules:
- positiveComment should be 1 sentence, sound personal and warm, and mention something specific from the student's answer or topic.
- positiveComment should not mention grammar mistakes or corrections.
- Keep each item concise (under 15 words)
- Be encouraging and constructive
- Focus on what the student did well first
- Include areas for improvement
- All arrays should contain 1-3 items
- Return empty arrays for non-applicable categories
- Do not assess pronunciation or timing-based fluency from this text transcript. Leave pronunciation empty.
- Treat transcription uncertainty as uncertainty; never claim an acoustic observation.
- Do not include a rewritten or improved version of the full answer.
"""


def normalize_level(level: str) -> str:
    return level if level in LEVEL_POSITIVE_FALLBACK_PROMPTS else "A1"


def random_level_prompt(prompts: dict[str, list[str]], level: str) -> str:
    return secrets.choice(prompts[normalize_level(level)])


def default_feedback(user_answer: str, level: str = "A1") -> dict[str, Any]:
    return {
        "positiveComment": random_level_prompt(LEVEL_POSITIVE_FALLBACK_PROMPTS, level),
        "overall": "Thank you for your response. Keep practicing!",
        "grammar": [],
        "vocabulary": [],
        "pronunciation": [],
        "fluency": [],
        "suggestions": ["Continue practicing with more examples."],
    }


def parse_json_object(text: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if not json_match:
            return None
        try:
            parsed = json.loads(json_match.group())
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None

def normalize_feedback(feedback_json: dict[str, Any], user_answer: str, level: str) -> dict[str, Any]:
    feedback_json["positiveComment"] = str(
        feedback_json.get("positiveComment")
        or feedback_json.get("positive_comment")
        or default_feedback(user_answer, level)["positiveComment"]
    )
    for key in ("grammar", "vocabulary", "pronunciation", "fluency", "suggestions"):
        if not isinstance(feedback_json.get(key), list):
            feedback_json[key] = []
    feedback_json["overall"] = str(feedback_json.get("overall") or "")
    # The API receives text only; no model-generated acoustic assessment is valid.
    feedback_json['pronunciation'] = []
    return feedback_json


def normalize_improved_version(improved: dict[str, Any] | str) -> dict[str, Any]:
    if isinstance(improved, str):
        improved = {"text": improved}

    allowed_types = {"unchanged", "grammar", "improvement", "clarity"}
    segments = improved.get("segments")
    normalized_segments = []
    if isinstance(segments, list):
        for segment in segments:
            if not isinstance(segment, dict):
                continue
            text = str(segment.get("text") or segment.get("content") or segment.get("revised") or "")
            if not text:
                continue
            segment_type = str(segment.get("type") or "improvement")
            normalized_segments.append({
                "text": text,
                "type": segment_type if segment_type in allowed_types else "improvement",
                "note": str(segment.get("note") or ""),
            })

    if not normalized_segments:
        revised_text = str(
            improved.get("text")
            or improved.get("revised")
            or improved.get("revisedText")
            or improved.get("revised_text")
            or improved.get("improvedText")
            or improved.get("improved_text")
            or improved.get("answer")
            or ""
        ).strip()
        if revised_text:
            normalized_segments = [{"text": revised_text, "type": "improvement", "note": "Improved version"}]

    changes = improved.get("changes")
    return {
        "title": str(improved.get("title") or "Improved version"),
        "summary": str(improved.get("summary") or ""),
        "segments": normalized_segments,
        "changes": changes if isinstance(changes, list) else [],
    }


IMPROVED_VERSION_JSON_FORMAT = """Required JSON format:
{
  "improvedVersion": {
    "title": "Improved version",
    "summary": "One short sentence explaining the biggest improvement.",
    "revisedText": "The complete improved answer as one readable text.",
    "segments": [
      {
        "text": "A phrase or sentence from the improved answer.",
        "type": "grammar | improvement | clarity | unchanged",
        "note": "Short reason"
      }
    ],
    "changes": [
      {
        "original": "Original phrase",
        "revised": "Revised phrase",
        "type": "grammar | improvement | clarity",
        "reason": "Short reason"
      }
    ]
  }
}"""


def build_improved_version_prompt(question: str, user_answer: str, level: str, practice_mode: str) -> str:
    return f"""Rewrite the student's English answer into one clearly improved version.

Practice Question:
{question}

Student's Response:
{user_answer}

Student CEFR Level: {level}
Practice Mode: {practice_mode}

Return ONLY valid JSON using this exact schema:
{IMPROVED_VERSION_JSON_FORMAT}

Rules:
- This request is separate from feedback. Do not provide feedback lists.
- Always return a complete improved answer in improvedVersion.revisedText.
- improvedVersion.segments must combine to form one complete polished answer.
- If detailed segments are difficult, return one segment containing the full improved answer.
- Do not simply copy the student's original response unless it is already perfect.
- Preserve the student's intended meaning.
- Use "grammar" for grammar, tense, article, word form, spelling, or punctuation fixes.
- Use "improvement" for stronger vocabulary or more natural phrasing.
- Use "clarity" for better organization, flow, or sentence structure.
- Use "unchanged" only for text that truly did not need changes.
- Keep the answer appropriate for CEFR level {level}.
"""


async def generate_improved_version(question: str, user_answer: str, level: str, practice_mode: str) -> dict[str, Any] | None:
    improved_text = await json_chat_completion(
        system_prompt=(
            TUTOR_POLICY + "\nYou are a careful English rewriting assistant. Return only valid JSON. "
            "Do not include markdown or text outside the JSON object.\n\n"
            f"{IMPROVED_VERSION_JSON_FORMAT}"
        ),
        message=build_improved_version_prompt(question, user_answer, level, practice_mode),
        max_tokens=900,
    )
    parsed = parse_json_object(improved_text)
    if not parsed and improved_text.strip():
        return normalize_improved_version(improved_text.strip())
    if not parsed:
        return None

    improved = (
        parsed.get("improvedVersion")
        or parsed.get("improved_version")
        or parsed.get("revisedText")
        or parsed.get("revised_text")
        or parsed.get("improvedText")
        or parsed.get("improved_text")
        or parsed.get("text")
        or parsed.get("answer")
    )
    return normalize_improved_version(improved) if isinstance(improved, (dict, str)) else None


def build_simple_improved_version_prompt(question: str, user_answer: str, level: str, practice_mode: str) -> str:
    return f"""Rewrite the student's answer into one improved English version.

Practice Question:
{question}

Student's Answer:
{user_answer}

Student CEFR Level: {level}
Practice Mode: {practice_mode}

Return only the improved answer text. Do not include feedback, bullet points, labels, markdown, or explanations.
Keep the student's intended meaning, but make the answer clearer, more natural, and appropriate for CEFR level {level}.
"""


async def generate_simple_improved_version(question: str, user_answer: str, level: str, practice_mode: str) -> dict[str, Any] | None:
    improved_text = (await chat_completion(
        system_prompt=TUTOR_POLICY + "\nYou rewrite learner English. Return only the improved answer text.",
        message=build_simple_improved_version_prompt(question, user_answer, level, practice_mode),
        max_tokens=500,
    )).strip()

    if not improved_text:
        return None

    return normalize_improved_version({
        "title": "Improved version",
        "summary": "This version improves clarity and natural expression.",
        "revisedText": improved_text,
        "segments": [{"text": improved_text, "type": "improvement", "note": "Improved version"}],
        "changes": [],
    })


@app.post("/api/feedback", dependencies=[Depends(authorize_request)])
async def feedback(payload: FeedbackRequest) -> JSONResponse:
    req = payload.model_dump()
    question = str(req.get("question") or "").strip()
    user_answer = str(req.get("userAnswer") or "").strip()
    level = str(req.get("level") or "A1")
    tests = str(req.get("tests") or "General")
    skills = str(req.get("skills") or "General")
    practice_mode = str(req.get("practiceMode") or "speaking")

    if not question or not user_answer:
        return JSONResponse({"error": "question and userAnswer are required"}, status_code=400)

    try:
        prompt = build_feedback_prompt(question, user_answer, level, tests, skills, practice_mode)
        feedback_text = await chat_completion(
            system_prompt=TUTOR_POLICY + "\nYou are a JSON provider. Return only valid JSON.",
            message=prompt,
            max_tokens=1400
        )

        parsed_feedback = parse_json_object(feedback_text)
        if parsed_feedback is None:
            raise ValueError('Invalid feedback output')
        feedback_json = normalize_feedback(
            parsed_feedback,
            user_answer,
            level,
        )
        return JSONResponse({"feedback": feedback_json})
    except Exception as exc:
        return provider_error(exc, "generation")


@app.post("/api/improved-version", dependencies=[Depends(authorize_request)])
async def improved_version(payload: FeedbackRequest) -> JSONResponse:
    req = payload.model_dump()
    question = str(req.get("question") or "").strip()
    user_answer = str(req.get("userAnswer") or "").strip()
    level = str(req.get("level") or "A1")
    practice_mode = str(req.get("practiceMode") or "speaking")

    if not question or not user_answer:
        return JSONResponse({"error": "question and userAnswer are required"}, status_code=400)

    try:
        improved = await generate_improved_version(question, user_answer, level, practice_mode)

        if not improved or not improved.get("segments"):
            improved = await generate_simple_improved_version(question, user_answer, level, practice_mode)

        if not improved or not improved.get("segments"):
            return JSONResponse({"error": "Improved version generation failed"}, status_code=500)
        return JSONResponse({"improvedVersion": improved})
    except Exception as exc:
        return provider_error(exc, "generation")


from learning import router as learning_router
app.include_router(learning_router)
