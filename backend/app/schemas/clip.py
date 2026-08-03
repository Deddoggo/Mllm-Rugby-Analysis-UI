"""Typed clip persistence and public API contracts."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ClipRecord(BaseModel):
    """Persistent metadata for one accurately extracted event clip."""

    clip_id: str = Field(min_length=1)
    video_id: str = Field(min_length=1)
    event_id: str = Field(min_length=1)
    event_label: str = Field(min_length=1)
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    duration: float = Field(ge=2, le=60)
    status: Literal["ready"] = "ready"
    path: str = Field(min_length=1)
    stream_url: str = Field(min_length=1)
    extraction_profile: str = Field(min_length=1)
    source_video_path: str = Field(min_length=1)
    created_at: datetime

    @model_validator(mode="after")
    def validate_boundaries(self) -> "ClipRecord":
        if self.end <= self.start:
            raise ValueError("Clip end must be after start.")
        if abs((self.end - self.start) - self.duration) > 0.001:
            raise ValueError("Clip duration must match its boundaries.")
        return self


class ClipCreateRequest(BaseModel):
    """Request extraction from the latest persisted event boundaries."""

    event_id: str = Field(min_length=1, pattern=r"^[A-Za-z0-9_-]+$")
    force: bool = False


class ClipCreateResponse(BaseModel):
    """Public clip representation without local filesystem paths."""

    clip_id: str
    video_id: str
    event_id: str
    event_label: str
    start: float
    end: float
    duration: float
    status: Literal["ready"]
    stream_url: str
    extraction_profile: str
    created_at: datetime
    cached: bool


class ClipListResponse(BaseModel):
    """All currently valid cached clips for a video."""

    video_id: str
    clips: list[ClipCreateResponse] = Field(default_factory=list)
