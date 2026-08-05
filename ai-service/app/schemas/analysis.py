"""Stable request, conversation, and response contracts for analysis."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class AnalysisQueryRequest(BaseModel):
    """Identifiers and natural-language question for one prepared event clip."""

    video_id: str = Field(min_length=1, pattern=r"^[A-Za-z0-9_-]+$")
    event_id: str = Field(min_length=1, pattern=r"^[A-Za-z0-9_-]+$")
    clip_id: str = Field(min_length=1, pattern=r"^[A-Za-z0-9_-]+$")
    question: str = Field(min_length=1, max_length=4000)


class AnalysisContextUsed(BaseModel):
    """Public context supplied to the active VLM adapter."""

    video: dict[str, Any] = Field(default_factory=dict)
    event: dict[str, Any] = Field(default_factory=dict)
    clip: dict[str, Any] = Field(default_factory=dict)


class AnalysisMetadata(BaseModel):
    """Structured evidence passed to the active provider."""

    context_used: AnalysisContextUsed


class ProviderMetadata(BaseModel):
    """Presentation metadata supplied by the AI service, not inferred by clients."""

    id: str
    display_name: str
    model: str | None = None


class ConversationMessage(BaseModel):
    """One persisted user or assistant conversation message."""

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)
    provider: str | None = None
    provider_metadata: ProviderMetadata | None = None
    created_at: datetime


class ConversationRecord(BaseModel):
    """Filesystem representation of one clip-scoped conversation."""

    conversation_id: str
    video_id: str
    event_id: str
    clip_id: str
    messages: list[ConversationMessage] = Field(default_factory=list)


class ConversationHistoryResponse(ConversationRecord):
    """Conversation returned to the backend and frontend."""


class AnalysisQueryResponse(BaseModel):
    """Model-independent answer contract."""

    answer: str
    provider: str
    provider_metadata: ProviderMetadata
    conversation_id: str
    turn_number: int = Field(ge=1)
    confidence: Literal["limited"] = "limited"
    metadata: AnalysisMetadata
