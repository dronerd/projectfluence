from functools import lru_cache
from io import BytesIO
import os
import json
import logging
from pathlib import Path
import re
import secrets
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from openai import OpenAI

load_dotenv(Path(__file__).with_name(".env"))
load_dotenv()

app = FastAPI(title="SpeakWise API", version="1.0.0")
logger = logging.getLogger("speakwise")

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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def get_openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    return OpenAI(api_key=api_key)


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

    return f"""You are SpeakWise, a warm and precise English tutor.

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


def chat_completion(system_prompt: str, message: str, max_tokens: int) -> str:
    completion = get_openai_client().chat.completions.create(
        model=os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini"),
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ],
        temperature=0.7,
        max_tokens=max_tokens,
    )
    return completion.choices[0].message.content or ""


def json_chat_completion(system_prompt: str, message: str, max_tokens: int) -> str:
    try:
        completion = get_openai_client().chat.completions.create(
            model=os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message},
            ],
            temperature=0.45,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        return completion.choices[0].message.content or ""
    except Exception as exc:
        # Some deployed model/SDK combinations reject response_format even
        # though the plain chat call works. Feedback uses the plain path, so
        # retry that path while keeping strict JSON instructions in messages.
        logger.warning("JSON response_format request failed; retrying without response_format: %s", exc)
        return chat_completion(system_prompt, message, max_tokens)


@app.api_route("/health", methods=["GET", "HEAD"])
def health() -> Response:
    return Response(status_code=200)


@app.post("/api/chat")
async def chat(req: dict[str, Any]) -> JSONResponse:
    mode = str(req.get("mode") or "speaking")
    if mode == "warmup":
        return JSONResponse({"status": "ok", "mode": "warmup"})

    if mode not in {"speaking", "lesson"}:
        return JSONResponse({"error": "Unknown mode. Use 'speaking', 'lesson', or 'warmup'."}, status_code=400)

    message = str(req.get("message") or "").strip()
    if not message:
        return JSONResponse({"error": "message is required"}, status_code=400)

    try:
        max_tokens = 700 if mode == "lesson" else 500
        reply = chat_completion(build_chat_system_prompt(req), message, max_tokens=max_tokens)
        return JSONResponse({"reply": reply, "mode": mode})
    except RuntimeError as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)
    except Exception as exc:
        return JSONResponse({"error": "OpenAI chat request failed", "details": str(exc)}, status_code=500)

@app.post("/api/voice")
async def voice(req: dict[str, Any]):
    text = str(req.get("text") or "").strip()
    voice_name = str(req.get("voice") or "alloy")
    if not text:
        return JSONResponse({"error": "text is required"}, status_code=400)

    try:
        response = get_openai_client().audio.speech.create(
            model=os.getenv("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
            voice=voice_name,
            input=text,
        )

        audio_bytes = response.read() if hasattr(response, "read") else bytes(response)
        return StreamingResponse(BytesIO(audio_bytes), media_type="audio/mpeg")
    except RuntimeError as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)
    except Exception as exc:
        return JSONResponse({"error": "OpenAI voice request failed", "details": str(exc)}, status_code=500)

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
- Adjust focus based on practice_mode (speaking emphasizes pronunciation/fluency, writing emphasizes grammar)
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


def generate_improved_version(question: str, user_answer: str, level: str, practice_mode: str) -> dict[str, Any] | None:
    improved_text = json_chat_completion(
        system_prompt=(
            "You are a careful English rewriting assistant. Return only valid JSON. "
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


def generate_simple_improved_version(question: str, user_answer: str, level: str, practice_mode: str) -> dict[str, Any] | None:
    improved_text = chat_completion(
        system_prompt="You rewrite learner English. Return only the improved answer text.",
        message=build_simple_improved_version_prompt(question, user_answer, level, practice_mode),
        max_tokens=500,
    ).strip()

    if not improved_text:
        return None

    return normalize_improved_version({
        "title": "Improved version",
        "summary": "This version improves clarity and natural expression.",
        "revisedText": improved_text,
        "segments": [{"text": improved_text, "type": "improvement", "note": "Improved version"}],
        "changes": [],
    })


@app.post("/api/feedback")
async def feedback(req: dict[str, Any]) -> JSONResponse:
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
        feedback_text = chat_completion(
            system_prompt="You are a JSON provider. Return only valid JSON.",
            message=prompt,
            max_tokens=1400
        )

        feedback_json = normalize_feedback(
            parse_json_object(feedback_text) or default_feedback(user_answer, level),
            user_answer,
            level,
        )
        return JSONResponse({"feedback": feedback_json})
    except RuntimeError as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)
    except Exception as exc:
        return JSONResponse({"error": "Feedback generation failed", "details": str(exc)}, status_code=500)


@app.post("/api/improved-version")
async def improved_version(req: dict[str, Any]) -> JSONResponse:
    question = str(req.get("question") or "").strip()
    user_answer = str(req.get("userAnswer") or "").strip()
    level = str(req.get("level") or "A1")
    practice_mode = str(req.get("practiceMode") or "speaking")

    if not question or not user_answer:
        return JSONResponse({"error": "question and userAnswer are required"}, status_code=400)

    try:
        improved = None
        try:
            improved = generate_improved_version(question, user_answer, level, practice_mode)
        except Exception as structured_exc:
            logger.warning("Structured improved-version generation failed: %s", structured_exc)

        if not improved or not improved.get("segments"):
            improved = generate_simple_improved_version(question, user_answer, level, practice_mode)

        if not improved or not improved.get("segments"):
            return JSONResponse({"error": "Improved version generation failed"}, status_code=500)
        return JSONResponse({"improvedVersion": improved})
    except RuntimeError as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)
    except Exception as exc:
        return JSONResponse({"error": "Improved version generation failed", "details": str(exc)}, status_code=500)
