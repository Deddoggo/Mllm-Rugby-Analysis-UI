"""Temporary clip preview API contracts, separate from persistent clip metadata."""

from typing import Literal

from pydantic import BaseModel, Field


class ClipPreviewRequest(BaseModel):
    """Request a temporary preview using authoritative persisted boundaries."""

    event_id: str = Field(min_length=1, pattern=r"^[A-Za-z0-9_-]+$")


class ClipPreviewResponse(BaseModel):
    """Public metadata for a process-temporary, non-cached preview."""

    preview_id: str
    video_id: str
    event_id: str
    event_label: str
    start: float
    end: float
    duration: float
    status: Literal["ready"] = "ready"
    stream_url: str
    temporary: Literal[True] = True
