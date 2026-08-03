"""Orchestrate processed videos, detector adapters, and event persistence."""

import asyncio
from pathlib import Path
import sys

from pydantic import ValidationError

from app.core.config import AI_SERVICE_DIR, DATA_DIR, REPOSITORY_ROOT
from app.schemas.event import EventDetectionResponse, EventListResponse, VideoEvent
from app.schemas.video import VideoMetadata
from app.services.event_repository import EventRepository
from app.services.video_metadata import VideoMetadataService


if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

from vjepa2.contracts import EventDetector  # noqa: E402
from vjepa2.mock_detector import MockVJEPA2Detector  # noqa: E402


class VideoNotFoundError(LookupError):
    """Raised when a video ID has no metadata record."""


class VideoNotReadyError(RuntimeError):
    """Raised when a video cannot yet be analyzed."""


class InvalidDetectorOutputError(ValueError):
    """Raised when metadata or detector output violates the event contract."""


class EventDetectionService:
    """Keep detector details out of API routes and persistence code."""

    def __init__(
        self,
        metadata_service: VideoMetadataService | None = None,
        repository: EventRepository | None = None,
        detector: EventDetector | None = None,
    ) -> None:
        self.metadata_service = metadata_service or VideoMetadataService()
        self.repository = repository or EventRepository()
        self.detector = detector or MockVJEPA2Detector()

    async def detect_events(
        self,
        video_id: str,
        force: bool = False,
    ) -> EventDetectionResponse:
        metadata = self._require_video(video_id)
        if not force:
            existing = self.repository.get_events(video_id)
            if existing is not None:
                return EventDetectionResponse.model_validate(existing)

        if metadata.status != "processed" or not metadata.processed_path:
            raise VideoNotReadyError("Video preprocessing is not complete.")
        if metadata.duration is None or metadata.duration <= 0:
            raise InvalidDetectorOutputError("Video duration is unavailable or invalid.")
        video_path = self._resolve_video_path(metadata.processed_path)
        if not video_path.is_file():
            raise VideoNotReadyError("Processed video file is unavailable.")

        proposals = await asyncio.to_thread(
            self.detector.detect_events,
            str(video_path),
            video_id,
            metadata.duration,
        )
        try:
            events = [
                VideoEvent.model_validate(proposal)
                for proposal in proposals
                if proposal.get("label") != "Background"
            ]
        except (ValidationError, AttributeError, TypeError) as error:
            raise InvalidDetectorOutputError("Detector returned invalid event proposals.") from error
        if any(
            event.video_id != video_id
            or event.end > metadata.duration
            or event.detected_end > metadata.duration
            for event in events
        ):
            raise InvalidDetectorOutputError("Detector timestamps exceed the video contract.")
        return self.repository.save_events(
            video_id,
            events,
            detector=self.detector.name,
            status="ready",
        )

    def get_events(self, video_id: str) -> EventListResponse:
        self._require_video(video_id)
        stored = self.repository.get_events(video_id)
        if stored is not None:
            return stored
        return EventListResponse(
            video_id=video_id,
            status="not_detected",
            detector=None,
            events=[],
        )

    def update_event(
        self,
        video_id: str,
        event_id: str,
        start: float,
        end: float,
    ) -> VideoEvent:
        self._require_video(video_id)
        return self.repository.update_event(video_id, event_id, start, end)

    def _require_video(self, video_id: str) -> VideoMetadata:
        try:
            metadata = self.metadata_service.get_by_id(video_id)
        except (RuntimeError, ValueError) as error:
            raise InvalidDetectorOutputError("Video metadata could not be read.") from error
        if metadata is None:
            raise VideoNotFoundError(f"Video not found: {video_id}")
        return metadata

    def _resolve_video_path(self, stored_path: str) -> Path:
        candidate = (REPOSITORY_ROOT / stored_path).resolve()
        if not candidate.is_relative_to(DATA_DIR.resolve()):
            raise InvalidDetectorOutputError("Processed video path is outside the data directory.")
        return candidate
