from functools import lru_cache
from io import BytesIO
import os
import json
import re
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from openai import OpenAI

load_dotenv()

app = FastAPI(title="SpeakWise API", version="1.0.0")


def _cors_origins() -> list[str]:
    configured = os.getenv("SPEAKWISE_CORS_ORIGINS")
    if configured:
        return [origin.strip() for origin in configured.split(",") if origin.strip()]

    return [
        "https://projectfluence.vercel.app",
        "https://vocabstream.vercel.app",
        "https://vocabstream-for-testing.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
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

COMPONENT_ALIASES = {
    "単語": "vocab",
    "単語練習": "vocab",
    "vocab practice": "vocab",
    "vocabulary practice": "vocab",
    "文章読解": "reading",
    "reading comprehension": "reading",
    "会話練習": "conversation",
    "speaking practice": "conversation",
    "conversation practice": "conversation",
    "文法": "grammar",
    "文法練習": "grammar",
    "grammar": "grammar",
}


def component_kind(name: str | None) -> str:
    if not name:
        return "general"
    return COMPONENT_ALIASES.get(name.strip().lower(), COMPONENT_ALIASES.get(name, "general"))


def build_casual_system_prompt(level: str, topics: list[str]) -> str:
    topics_text = ", ".join(topics) if topics else "general topics"
    return f"""You are SpeakWise, a friendly English conversation partner.

Help the learner practice English at CEFR level {level}.
Use topics connected to: {topics_text}.

Conversation style:
- Keep the conversation natural, warm, and encouraging.
- Ask one clear follow-up question at a time.
- Use vocabulary and sentence complexity suitable for {level}.
- Gently correct important mistakes without interrupting the flow.
- Encourage longer answers when the learner seems ready."""


def build_lesson_system_prompt(
    level: str,
    topics: list[str],
    tests: list[str],
    skills: list[str],
    current_component: str,
    component_timing: dict[str, Any] | None,
    vocab_category: str | None,
    vocab_lessons: list[str],
) -> str:
    topics_text = ", ".join(topics) if topics else "general topics"
    tests_text = ", ".join(tests) if tests else "General English"
    skills_text = ", ".join(skills) if skills else "all skills"
    remaining_seconds = int((component_timing or {}).get("durationSeconds", 300))
    remaining_minutes = max(1, round(remaining_seconds / 60))
    kind = component_kind(current_component)

    if kind == "vocab":
        lesson_text = ", ".join(vocab_lessons) if vocab_lessons else "the selected lessons"
        component_guidance = f"""Focus on vocabulary practice.
- Use vocabulary from category: {vocab_category or "the learner's selected category"}.
- Prefer lessons: {lesson_text}.
- Introduce a small number of useful words in context.
- Ask the learner to use one word in their own sentence."""
    elif kind == "reading":
        component_guidance = """Focus on reading comprehension.
- Provide a short level-appropriate passage.
- Ask one comprehension question.
- Explain difficult vocabulary briefly."""
    elif kind == "conversation":
        component_guidance = """Focus on speaking and conversation practice.
- Ask open-ended questions.
- Give concise feedback after the learner responds.
- Keep the exchange realistic and useful."""
    elif kind == "grammar":
        component_guidance = """Focus on grammar practice.
- Teach one grammar point or give one targeted exercise.
- Ask the learner to produce an example.
- Explain corrections clearly and kindly."""
    else:
        component_guidance = f"Focus on {current_component or 'general English practice'} in a structured, level-appropriate way."

    return f"""You are SpeakWise, a professional English tutor.

Student profile:
- CEFR level: {level}
- Target tests: {tests_text}
- Target skills: {skills_text}
- Topics of interest: {topics_text}

Current lesson component: {current_component or "General"}
Approximate time for this section: {remaining_minutes} minutes.

Component guidance:
{component_guidance}

Teaching principles:
- Match the learner's CEFR level.
- Keep replies focused enough for the remaining time.
- Give feedback that is specific, encouraging, and easy to act on.
- Ask one next question or task at the end unless you are wrapping up."""


def get_current_timing(req: dict[str, Any]) -> dict[str, Any] | None:
    component_timing = req.get("componentTiming") or []
    current_index = int(req.get("currentComponent") or 0)
    if 0 <= current_index < len(component_timing):
        timing = component_timing[current_index]
        return timing if isinstance(timing, dict) else None
    return None


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


@app.get("/")
def root() -> dict[str, Any]:
    return {"status": "ok", "service": "speakwise-api", "modes": ["casual", "lesson"]}


@app.api_route("/health", methods=["GET", "HEAD"])
def health() -> Response:
    return Response(status_code=200)


@app.post("/api/chat")
async def chat(req: dict[str, Any]) -> JSONResponse:
    mode = req.get("mode", "casual")
    if mode == "warmup":
        return JSONResponse({"status": "ok", "mode": "warmup"})

    message = str(req.get("message") or "").strip()
    if not message:
        return JSONResponse({"error": "message is required"}, status_code=400)

    try:
        level = str(req.get("level") or "A1")
        topics = req.get("topics") if isinstance(req.get("topics"), list) else ["General"]

        if mode == "lesson":
            current_timing = get_current_timing(req)
            remaining_seconds = int((current_timing or {}).get("durationSeconds", 300))
            max_tokens = min(max(int((remaining_seconds / 60) * 120), 180), 700)
            system_prompt = build_lesson_system_prompt(
                level=level,
                topics=topics,
                tests=req.get("tests") if isinstance(req.get("tests"), list) else [],
                skills=req.get("skills") if isinstance(req.get("skills"), list) else [],
                current_component=str(req.get("currentComponentName") or "General"),
                component_timing=current_timing,
                vocab_category=req.get("vocabCategory"),
                vocab_lessons=req.get("vocabLessons") if isinstance(req.get("vocabLessons"), list) else [],
            )
            reply = chat_completion(system_prompt, message, max_tokens=max_tokens)
            return JSONResponse({"reply": reply, "mode": "lesson"})

        if mode != "casual":
            return JSONResponse({"error": "Unknown mode. Use 'casual' or 'lesson'."}, status_code=400)

        system_prompt = build_casual_system_prompt(level, topics)
        reply = chat_completion(system_prompt, message, max_tokens=500)
        return JSONResponse({"reply": reply, "mode": "casual"})
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
  "overall": "A 1-2 sentence overall assessment of the response",
  "grammar": ["Grammar point 1", "Grammar point 2"],
  "vocabulary": ["Vocabulary suggestion 1", "Vocabulary suggestion 2"],
  "pronunciation": ["Pronunciation tip 1"],
  "fluency": ["Fluency observation 1", "Fluency observation 2"],
  "suggestions": ["Actionable suggestion 1", "Actionable suggestion 2"],
  "improvedVersion": {{
    "title": "Improved version",
    "summary": "One short sentence explaining the biggest improvement",
    "segments": [
      {{
        "text": "Unchanged text copied from the improved response.",
        "type": "unchanged",
        "note": ""
      }},
      {{
        "text": "Corrected grammar phrase.",
        "type": "grammar",
        "note": "Briefly explain the grammar fix."
      }},
      {{
        "text": "Stronger vocabulary or expression.",
        "type": "improvement",
        "note": "Briefly explain why this is better."
      }},
      {{
        "text": "Clearer connecting words or organization.",
        "type": "clarity",
        "note": "Briefly explain the clarity improvement."
      }}
    ],
    "changes": [
      {{
        "original": "Original phrase",
        "revised": "Revised phrase",
        "type": "grammar",
        "reason": "Short reason"
      }}
    ]
  }}
}}

Rules:
- Keep each item concise (under 15 words)
- Be encouraging and constructive
- Focus on what the student did well first
- Include areas for improvement
- All arrays should contain 1-3 items
- Return empty arrays for non-applicable categories
- Adjust focus based on practice_mode (speaking emphasizes pronunciation/fluency, writing emphasizes grammar)
- The improvedVersion.segments must combine to form one complete polished answer.
- Do not include the rewritten/improved answer in overall, grammar, vocabulary, pronunciation, fluency, or suggestions.
- Put all rewritten answer text only inside improvedVersion.segments.
- Use "unchanged" only for text that is essentially unchanged from the student's response.
- Use "grammar" for corrected grammar, word form, article, tense, or punctuation.
- Use "improvement" for stronger vocabulary, more natural phrasing, or richer expression.
- Use "clarity" for better flow, organization, transitions, or sentence structure.
- Keep segment text short enough that highlighting is easy to read.
"""


def default_feedback(user_answer: str) -> dict[str, Any]:
    return {
        "overall": "Thank you for your response. Keep practicing!",
        "grammar": [],
        "vocabulary": [],
        "pronunciation": [],
        "fluency": [],
        "suggestions": ["Continue practicing with more examples."],
        "improvedVersion": {
            "title": "Improved version",
            "summary": "Here is a cleaned-up version to compare with your response.",
            "segments": [{"text": user_answer, "type": "unchanged", "note": ""}] if user_answer else [],
            "changes": [],
        },
    }


def normalize_improved_version(feedback_json: dict[str, Any], user_answer: str) -> dict[str, Any]:
    improved = feedback_json.get("improvedVersion")
    if not isinstance(improved, dict):
        feedback_json["improvedVersion"] = default_feedback(user_answer)["improvedVersion"]
        return feedback_json

    segments = improved.get("segments")
    if not isinstance(segments, list) or not segments:
        revised_text = str(improved.get("text") or improved.get("revised") or user_answer).strip()
        improved["segments"] = [{"text": revised_text, "type": "unchanged", "note": ""}] if revised_text else []
    else:
        allowed_types = {"unchanged", "grammar", "improvement", "clarity"}
        normalized_segments = []
        for segment in segments:
            if not isinstance(segment, dict):
                continue
            text = str(segment.get("text") or "")
            if not text:
                continue
            segment_type = str(segment.get("type") or "unchanged")
            normalized_segments.append({
                "text": text,
                "type": segment_type if segment_type in allowed_types else "improvement",
                "note": str(segment.get("note") or ""),
            })
        improved["segments"] = normalized_segments or default_feedback(user_answer)["improvedVersion"]["segments"]

    if not isinstance(improved.get("changes"), list):
        improved["changes"] = []
    improved["title"] = str(improved.get("title") or "Improved version")
    improved["summary"] = str(improved.get("summary") or "")
    feedback_json["improvedVersion"] = improved
    return feedback_json


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
            max_tokens=1000
        )

        try:
            feedback_json = json.loads(feedback_text)
        except json.JSONDecodeError:
            # If JSON parsing fails, try to extract JSON from the response
            json_match = re.search(r'\{.*\}', feedback_text, re.DOTALL)
            if json_match:
                feedback_json = json.loads(json_match.group())
            else:
                # Fallback if no valid JSON found
                feedback_json = default_feedback(user_answer)

        if not isinstance(feedback_json, dict):
            feedback_json = default_feedback(user_answer)

        feedback_json = normalize_improved_version(feedback_json, user_answer)
        return JSONResponse({"feedback": feedback_json})
    except RuntimeError as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)
    except Exception as exc:
        return JSONResponse({"error": "Feedback generation failed", "details": str(exc)}, status_code=500)
