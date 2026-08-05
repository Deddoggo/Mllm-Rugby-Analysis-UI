"""Private model-serving endpoint for rugby event detection."""

from fastapi import APIRouter, Depends, HTTPException

from app.schemas.event import EventDetectionRequest, EventDetectionResponse
from app.detectors.factory import DetectorUnavailableError
from app.services.event_detection_service import (
    AIEventDetectionService,
    EventDetectionInputError,
)


router = APIRouter(prefix="/analysis/events", tags=["event-detection"])
event_detection_service = AIEventDetectionService()


def get_event_detection_service() -> AIEventDetectionService:
    return event_detection_service


@router.post("/detect", response_model=EventDetectionResponse)
def detect_events(
    request: EventDetectionRequest,
    service: AIEventDetectionService = Depends(get_event_detection_service),
) -> EventDetectionResponse:
    try:
        return service.detect_events(
            request.video_path,
            request.video_id,
            request.detector,
        )
    except DetectorUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except EventDetectionInputError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
