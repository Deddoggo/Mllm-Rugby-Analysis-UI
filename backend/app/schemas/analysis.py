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


class ProviderMetadata(BaseModel):
    """Provider presentation metadata supplied by the AI service."""

    id: str
    display_name: str
    model: str | None = None


class ConversationMessage(BaseModel):
    """One persisted message in a clip-scoped conversation."""

    role: Literal["user", "assistant"]
    content: str
    provider: str | None = None
    provider_metadata: ProviderMetadata | None = None
    created_at: str


class ConversationHistoryResponse(BaseModel):
    """Conversation history forwarded unchanged from the AI service."""

    conversation_id: str
    video_id: str
    event_id: str
    clip_id: str
    messages: list[ConversationMessage] = Field(default_factory=list)


class AnalysisGatewayResponse(BaseModel):
    """Provider-independent response returned through the backend gateway."""

    answer: str
    provider: str
    provider_metadata: ProviderMetadata | None = None
    conversation_id: str | None = None
    turn_number: int = Field(default=1, ge=1)
    confidence: Literal["limited"]
    metadata: dict[str, Any] = Field(default_factory=dict)
