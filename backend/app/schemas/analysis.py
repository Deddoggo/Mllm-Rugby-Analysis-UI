"""Typed backend gateway and AI-service analysis contracts."""

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class AnalysisQuestionRequest(BaseModel):
    """Question submitted for an already prepared persistent clip."""

    question: str = Field(min_length=1, max_length=4000)

    @field_validator("question")
    @classmethod
    def question_must_contain_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Question must contain text.")
        return value


class AIServiceAnalysisRequest(BaseModel):
    """Internal request sent from the backend to the AI service."""

    video_id: str
    event_id: str
    clip_id: str
    question: str


class AnalysisGatewayResponse(BaseModel):
    """Provider-independent response returned through the backend gateway."""

    answer: str
    provider: str
    confidence: Literal["limited"]
    metadata: dict[str, Any] = Field(default_factory=dict)
