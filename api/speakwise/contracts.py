"""Bounded public API contracts; never coerce arbitrary objects into prompts."""
from typing import Annotated, Any, Literal
import json
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

Text = Annotated[str, StringConstraints(max_length=8000)]
Label = Annotated[str, StringConstraints(max_length=240)]
Labels = Annotated[list[Label], Field(max_length=32)]
Level = Literal['A1', 'A2', 'B1', 'B2', 'C1', 'C2']


class HistoryEntry(BaseModel):
    role: Literal['user', 'assistant']
    content: Text


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra='ignore')
    mode: Literal['speaking', 'lesson', 'agent', 'warmup'] = 'speaking'
    message: Text = ''
    level: Level = 'B2'
    lessonMode: Label = 'natural_conversation'
    topics: Labels = []
    tests: Labels = []
    skills: Labels = []
    components: Labels = []
    vocabLessons: Labels = []
    currentComponentName: Label = ''
    vocabCategory: Label = ''
    randomSeed: Label = ''
    durationMinutes: int = Field(default=15, ge=1, le=180)
    elapsedSeconds: int = Field(default=0, ge=0, le=10800)
    timeElapsedSeconds: int = Field(default=0, ge=0, le=10800)
    phase: Literal['start', 'continue'] = 'continue'
    history: list[HistoryEntry] = Field(default_factory=list, max_length=100)
    learnerMemory: dict[str, Any] | None = None
    pdfContext: Text = ''
    voiceEnabled: bool = False

    @field_validator('learnerMemory')
    @classmethod
    def bounded_memory(cls, value):
        if len(json.dumps(value, ensure_ascii=False)) > 24000:
            raise ValueError('Learner memory exceeds the allowed size')
        return value


class VoiceRequest(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4096)]
    voice: Literal['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'] = 'alloy'


class FeedbackRequest(BaseModel):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8000)]
    userAnswer: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8000)]
    level: Level = 'A1'
    tests: Label | Labels = 'General'
    skills: Label | Labels = 'General'
    practiceMode: Literal['speaking', 'writing'] = 'speaking'
