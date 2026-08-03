"""HTTP endpoints for detected rugby event proposals."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import ValidationError

from app.schemas.event import (
    EventBoundaryUpdateRequest,
    EventDetectionResponse,
    EventListResponse,
    VideoEvent,
)
from app.services.event_detection import (
    EventDetectionService,
    InvalidDetectorOutputError,
    VideoNotFoundError,
    VideoNotReadyError,
)
from app.services.event_repository import EventNotFoundError


router = APIRouter(prefix="/videos/{video_id}/events", tags=["events"])
event_detection_service = EventDetectionService()


def event_http_error(error: Exception) -> HTTPException:
    if isinstance(error, (InvalidDetectorOutputError, ValidationError)):
        return HTTPException(status_code=422, detail=str(error))
    if isinstance(error, VideoNotReadyError):
        return HTTPException(status_code=409, detail=str(error))
    if isinstance(error, (VideoNotFoundError, EventNotFoundError, ValueError)):
        return HTTPException(status_code=404, detail=str(error))
    return HTTPException(status_code=500, detail="Event data operation failed.")


@router.post("/detect", response_model=EventDetectionResponse)
async def detect_events(
    video_id: str,
    force: bool = Query(False),
) -> EventDetectionResponse:
    try:
        return await event_detection_service.detect_events(video_id, force=force)
    except Exception as error:
        raise event_http_error(error) from error


@router.get("", response_model=EventListResponse)
async def get_events(video_id: str) -> EventListResponse:
    try:
        return event_detection_service.get_events(video_id)
    except Exception as error:
        raise event_http_error(error) from error


@router.patch("/{event_id}", response_model=VideoEvent)
async def update_event_boundaries(
    video_id: str,
    event_id: str,
    boundaries: EventBoundaryUpdateRequest,
) -> VideoEvent:
    try:
        return event_detection_service.update_event(
            video_id,
            event_id,
            boundaries.start,
            boundaries.end,
        )
    except Exception as error:
        raise event_http_error(error) from error
