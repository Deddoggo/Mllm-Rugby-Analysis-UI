"""API request, response, and persistence schemas."""

from app.schemas.event import (
    EventBoundaryUpdateRequest,
    EventDetectionResponse,
    EventListResponse,
    VideoEvent,
)

__all__ = [
    "EventBoundaryUpdateRequest",
    "EventDetectionResponse",
    "EventListResponse",
    "VideoEvent",
]
