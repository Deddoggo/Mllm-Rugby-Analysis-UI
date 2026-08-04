"""Stable request and response contracts for multimodal analysis."""

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


class AnalysisQueryResponse(BaseModel):
    """Model-independent answer contract."""

    answer: str
    provider: str
    confidence: Literal["limited"] = "limited"
    metadata: AnalysisMetadata
