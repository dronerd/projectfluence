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

# this part should be updated
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

# this currently only have the level and topics input, 
# however, to call the OpenAI API in the lesson mode, we will need to add more information
# such as the remaining time, the question the user answered, the user's answer etc. 
# this function is currntly used in api/chat endpoint, but the casual speech mode is already deleted, so need to work on this.
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

# this build_lesson_system_prompt is used in the api/chat endpoint when the mode is lesson, it will provide more detailed guidance to the OpenAI model based on the current lesson component, remaining time, and other factors. This allows the model to generate more focused and effective responses for the learner during a structured lesson.
# this is from the old conversation lesson method, 
# therefore this function should be updated. 
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

# maybe this function can be simplified. 
# improve this function.
def get_current_timing(req: dict[str, Any]) -> dict[str, Any] | None:
    component_timing = req.get("componentTiming") or []
    current_index = int(req.get("currentComponent") or 0)
    if 0 <= current_index < len(component_timing):
        timing = component_timing[current_index]
        return timing if isinstance(timing, dict) else None
    return None

# this function is used to call the OpenAI API for generating chat completions. It takes a system prompt, a user message, and a max token limit, and returns the generated response from the model. This function is used in both casual and lesson modes to get the model's reply based on the constructed system prompt and user input.
# this function is correct
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


# this one still have the casual and lesson mode, need to modify this endpoint too
@app.get("/")
def root() -> dict[str, Any]:
    return {"status": "ok", "service": "speakwise-api", "modes": ["casual", "lesson"]}


# health check endpoint for Render/Vercel/etc
@app.api_route("/health", methods=["GET", "HEAD"])
def health() -> Response:
    # returns only status 200
    return Response(status_code=200)


# this is them main endpoint for chat, improve this for the new lesson methods. returns JSONResponse.
@app.post("/api/chat")
async def chat(req: dict[str, Any]) -> JSONResponse:
    # this gets mode from request, if the frontend sends in JSON {"mode": "lesson"}, then it will be in lesson mode.
    mode = req.get("mode", "casual")
    if mode == "warmup":
        return JSONResponse({"status": "ok", "mode": "warmup"})

    message = str(req.get("message") or "").strip()
    if not message:
        return JSONResponse({"error": "message is required"}, status_code=400)
    # for try, everything inside of the block might fail, so the code uses try to avoid crashing the server
    try:
        # modify here otherwise the level is defaulted to B1
        level = str(req.get("level") or "B1")
        topics = req.get("topics") if isinstance(req.get("topics"), list) else ["General"]

        # update the logic here of the max_tokens, in order to correctly prevent extreme usage.
        if mode == "lesson":
            # update this time calculation logic, as it is currelty based on the old component based timing. 
            current_timing = get_current_timing(req)
            remaining_seconds = int((current_timing or {}).get("durationSeconds", 300))
            max_tokens = min(max(int((remaining_seconds / 60) * 120), 180), 700)
            # use the build_lesson_system_prompt function to generate the system prompt
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
            # use the chat_completion function to get the reply from the OpenAI model
            reply = chat_completion(system_prompt, message, max_tokens=max_tokens)
            # return the reply and the mode in the JSONResponse
            return JSONResponse({"reply": reply, "mode": "lesson"})
        # the remaining option is casual, so if the mode is not casual, then return error. This parts also needs improvement. 
        if mode != "casual":
            return JSONResponse({"error": "Unknown mode. Use 'casual' or 'lesson'."}, status_code=400)
        # handling of the casual mode 
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


def default_feedback(user_answer: str) -> dict[str, Any]:
    return {
        "positiveComment": "Great effort. Your answer gives us a clear starting point to build on.",
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

# makes sure the feedback JSON has all the required fields and the correct types, and fills in defaults if necessary. This is important because the OpenAI model might not always return perfectly structured JSON, so this function helps ensure that the API response is consistent and won't break the frontend.
def normalize_feedback(feedback_json: dict[str, Any], user_answer: str) -> dict[str, Any]:
    feedback_json["positiveComment"] = str(
        feedback_json.get("positiveComment")
        or feedback_json.get("positive_comment")
        or default_feedback(user_answer)["positiveComment"]
    )
    for key in ("grammar", "vocabulary", "pronunciation", "fluency", "suggestions"):
        if not isinstance(feedback_json.get(key), list):
            feedback_json[key] = []
    feedback_json["overall"] = str(feedback_json.get("overall") or "")
    return feedback_json


def normalize_improved_version(improved: dict[str, Any]) -> dict[str, Any]:
    allowed_types = {"unchanged", "grammar", "improvement", "clarity"}
    segments = improved.get("segments")
    normalized_segments = []
    if isinstance(segments, list):
        for segment in segments:
            if not isinstance(segment, dict):
                continue
            text = str(segment.get("text") or "")
            if not text:
                continue
            segment_type = str(segment.get("type") or "improvement")
            normalized_segments.append({
                "text": text,
                "type": segment_type if segment_type in allowed_types else "improvement",
                "note": str(segment.get("note") or ""),
            })

    if not normalized_segments:
        revised_text = str(improved.get("text") or improved.get("revised") or "").strip()
        if revised_text:
            normalized_segments = [{"text": revised_text, "type": "improvement", "note": "Improved version"}]

    changes = improved.get("changes")
    return {
        "title": str(improved.get("title") or "Improved version"),
        "summary": str(improved.get("summary") or ""),
        "segments": normalized_segments,
        "changes": changes if isinstance(changes, list) else [],
    }


def build_improved_version_prompt(question: str, user_answer: str, level: str, practice_mode: str) -> str:
    return f"""Rewrite the student's English answer into a clearly improved version.

Practice Question:
{question}

Student's Response:
{user_answer}

Student CEFR Level: {level}
Practice Mode: {practice_mode}

Return ONLY valid JSON with this exact structure:
{{
  "improvedVersion": {{
    "title": "Improved version",
    "summary": "One short sentence explaining the biggest improvement",
    "segments": [
      {{
        "text": "A phrase in the improved answer.",
        "type": "grammar",
        "note": "Short reason"
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
- improvedVersion.segments must combine to form one complete polished answer.
- Do not simply copy the student's original response.
- Preserve the student's intended meaning.
- Use "grammar" for grammar, tense, article, word form, spelling, or punctuation fixes.
- Use "improvement" for stronger vocabulary or more natural phrasing.
- Use "clarity" for better organization, flow, or sentence structure.
- Use "unchanged" only for text that truly did not need changes.
- Keep the answer appropriate for CEFR level {level}.
"""


def generate_improved_version(question: str, user_answer: str, level: str, practice_mode: str) -> dict[str, Any] | None:
    improved_text = chat_completion(
        system_prompt="You are a JSON provider. Return only valid JSON.",
        message=build_improved_version_prompt(question, user_answer, level, practice_mode),
        max_tokens=900,
    )
    parsed = parse_json_object(improved_text)
    if not parsed:
        return None
    improved = parsed.get("improvedVersion") or parsed.get("improved_version")
    return normalize_improved_version(improved) if isinstance(improved, dict) else None


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

        feedback_json = normalize_feedback(parse_json_object(feedback_text) or default_feedback(user_answer), user_answer)
        # improve this to return this feedback in more structured way, so the frontend can use this information to display the feedback for each category
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
        # use the generate_improved_version function to get the improved version from the OpenAI model. 
        improved = generate_improved_version(question, user_answer, level, practice_mode)
        if not improved or not improved.get("segments"):
            return JSONResponse({"error": "Improved version generation failed"}, status_code=500)
        return JSONResponse({"improvedVersion": improved})
    except RuntimeError as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)
    except Exception as exc:
        return JSONResponse({"error": "Improved version generation failed", "details": str(exc)}, status_code=500)

# try creating my own endpoint for returning improved version text with comments on the places to be improved. 
# try to to have the vocabstream backend also here in the api folder.
# @api.get("/api/vocab") for getting vocab words
# @api.post("/api/vocab") for addign vocab word
# @api.get("/user-progress") for getting user progress, such as the vocab words they have learned, the grammar points they have practiced, etc.
# @api.patch("/user-progress") for updating user progress

# for making ML models and using them in FastAPI backend, 
# better to use Pytorch than Tensorflow and Keras, for flexibility, ease of debugging, ease of loading inside fastapi, exportable to onnx.
# JAX is too research oriented and advanced. 