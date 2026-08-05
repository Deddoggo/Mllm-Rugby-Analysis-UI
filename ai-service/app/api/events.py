"""Private multipart model-serving endpoint for rugby event detection."""

import asyncio
from pathlib import Path
import tempfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.schemas.event import EventDetectionResponse
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
async def detect_events(
    video: UploadFile = File(...),
    video_id: str = Form(..., min_length=1, pattern=r"^[A-Za-z0-9_-]+$"),
    detector: str = Form("mock", pattern=r"^(mock|vjepa2)$"),
    duration: float | None = Form(None, gt=0),
    service: AIEventDetectionService = Depends(get_event_detection_service),
) -> EventDetectionResponse:
    suffix = Path(video.filename or "video.mp4").suffix.lower()
    if suffix not in {".mp4", ".mov", ".mkv"}:
        suffix = ".mp4"
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            prefix="rugby-event-detection-",
            suffix=suffix,
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)
            size = 0
            while chunk := await video.read(1024 * 1024):
                temporary.write(chunk)
                size += len(chunk)
        if size == 0:
            raise EventDetectionInputError("Uploaded video file is empty.")
        return await asyncio.to_thread(
            service.detect_events,
            str(temporary_path),
            video_id,
            detector,
            duration,
        )
    except DetectorUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except EventDetectionInputError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    finally:
        await video.close()
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
