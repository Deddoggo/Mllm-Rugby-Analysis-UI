"""Orchestrate processed videos, AI-service inference, and event persistence."""

from pathlib import Path

from pydantic import ValidationError

from app.core.paths import resolve_data_path
from app.schemas.event import EventDetectionResponse, EventListResponse, VideoEvent
from app.schemas.video import VideoMetadata
from app.services.ai_service_client import (
    AIServiceDetectorUnavailableError,
    AIServiceResponseError,
    AIServiceTimeoutError,
    AIServiceUnavailableError,
    EventDetectionAIClient,
)
from app.services.event_repository import EventRepository
from app.services.video_metadata import VideoMetadataService


class VideoNotFoundError(LookupError):
    """Raised when a video ID has no metadata record."""


class VideoNotReadyError(RuntimeError):
    """Raised when a video cannot yet be analyzed."""


class InvalidDetectorOutputError(ValueError):
    """Raised when metadata or detector output violates the event contract."""


class EventDetectionUnavailableError(RuntimeError):
    """Raised when the AI-service detector cannot complete a request."""


class EventDetectionService:
    """Keep detector details out of API routes and persistence code."""

    def __init__(
        self,
        metadata_service: VideoMetadataService | None = None,
        repository: EventRepository | None = None,
        ai_client: EventDetectionAIClient | None = None,
    ) -> None:
        self.metadata_service = metadata_service or VideoMetadataService()
        self.repository = repository or EventRepository()
        self.ai_client = ai_client or EventDetectionAIClient()

    async def detect_events(
        self,
        video_id: str,
        force: bool = False,
        detector: str = "mock",
    ) -> EventDetectionResponse:
        metadata = self._require_video(video_id)
        if not force:
            existing = self.repository.get_events(video_id)
            compatible_detectors = {f"ai-service:{detector}"}
            if detector == "mock":
                compatible_detectors.update({"ai-service", "mock-vjepa2"})
            if existing is not None and existing.detector in compatible_detectors:
                return EventDetectionResponse.model_validate(existing)

        if metadata.status != "processed" or not metadata.processed_path:
            raise VideoNotReadyError("Video preprocessing is not complete.")
        if metadata.duration is None or metadata.duration <= 0:
            raise InvalidDetectorOutputError("Video duration is unavailable or invalid.")
        video_path = self._resolve_video_path(metadata.processed_path)

        print(
            "EVENT DEBUG:",
            {
                "video_id": video_id,
                "stored_path": metadata.processed_path,
                "resolved_path": str(video_path),
                "exists": video_path.exists(),
                "is_file": video_path.is_file(),
            },
        )

        if not video_path.is_file():
            raise VideoNotReadyError("Processed video file is unavailable.")

        try:
            detection = await self.ai_client.detect_events(
                str(video_path),
                video_id,
                detector,
            )
        except AIServiceDetectorUnavailableError as error:
            raise EventDetectionUnavailableError(str(error)) from error
        except AIServiceResponseError as error:
            raise InvalidDetectorOutputError(str(error)) from error
        except (AIServiceTimeoutError, AIServiceUnavailableError) as error:
            raise EventDetectionUnavailableError(str(error)) from error
        try:
            events = [
                VideoEvent.model_validate({
                    **proposal.model_dump(),
                    "video_id": video_id,
                    "detected_start": proposal.start,
                    "detected_end": proposal.end,
                    "adjusted": False,
                })
                for proposal in detection.events
                if proposal.label != "Background"
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
            detector=f"ai-service:{detector}",
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
        try:
            candidate = Path(resolve_data_path(stored_path))
        except ValueError as error:
            raise InvalidDetectorOutputError(
                "Processed video path is outside the data directory."
            ) from error
        return candidate
