"""Typed rugby event persistence and API contracts."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


EventLabel = Literal["Background", "Goal Kick", "Lineout", "Maul", "Scrum"]
EventStatus = Literal["not_detected", "ready"]
MAX_EVENT_DURATION_SECONDS = 60.0


class VideoEvent(BaseModel):
    """One detector proposal with immutable detected and editable boundaries."""

    id: str = Field(min_length=1)
    video_id: str = Field(min_length=1)
    label: EventLabel
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    confidence: float = Field(ge=0, le=1)
    detected_start: float = Field(ge=0)
    detected_end: float = Field(gt=0)
    adjusted: bool = False

    @model_validator(mode="after")
    def validate_boundaries(self) -> "VideoEvent":
        if self.end <= self.start:
            raise ValueError("Event end must be after start.")
        if self.end - self.start > MAX_EVENT_DURATION_SECONDS:
            raise ValueError("Event duration cannot exceed 60 seconds.")
        if self.detected_end <= self.detected_start:
            raise ValueError("Detected event end must be after detected start.")
        return self


class EventListResponse(BaseModel):
    """Persistent event document and predictable GET response."""

    video_id: str
    status: EventStatus
    detector: str | None = None
    created_at: datetime | None = None
    events: list[VideoEvent] = Field(default_factory=list)


class EventDetectionResponse(EventListResponse):
    """Successful detector response."""

    status: Literal["ready"] = "ready"
    detector: str
    created_at: datetime


class EventBoundaryUpdateRequest(BaseModel):
    """Final timeline boundary adjustment submitted after a user gesture."""

    start: float = Field(ge=0)
    end: float = Field(gt=0)

    @model_validator(mode="after")
    def validate_boundaries(self) -> "EventBoundaryUpdateRequest":
        if self.end <= self.start:
            raise ValueError("Event end must be after start.")
        if self.end - self.start > MAX_EVENT_DURATION_SECONDS:
            raise ValueError("Event duration cannot exceed 60 seconds.")
        return self
