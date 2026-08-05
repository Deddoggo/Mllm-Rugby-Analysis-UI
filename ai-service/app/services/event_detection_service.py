"""AI-owned detector orchestration over request-scoped video files."""

from pathlib import Path

from pydantic import ValidationError

from app.detectors.factory import get_detector
from app.schemas.event import DetectedEventProposal, EventDetectionResponse
from vjepa2.contracts import EventDetector


DEFAULT_MOCK_VIDEO_DURATION_SECONDS = 300.0


class EventDetectionInputError(ValueError):
    """Raised when an uploaded inference input is unavailable or malformed."""


class AIEventDetectionService:
    """Keep detector implementations private to the AI-service process."""

    def __init__(
        self,
        detector: EventDetector | None = None,
    ) -> None:
        self.detector = detector

    def detect_events(
        self,
        video_path: str,
        video_id: str,
        detector_name: str = "mock",
        duration: float | None = None,
    ) -> EventDetectionResponse:
        resolved_path = self._resolve_video_path(video_path)
        effective_duration = (
            float(duration)
            if duration is not None
            else DEFAULT_MOCK_VIDEO_DURATION_SECONDS
        )
        if effective_duration <= 0:
            raise EventDetectionInputError("Video duration is unavailable or invalid.")
        detector = (
            self.detector
            if self.detector is not None and detector_name == "mock"
            else get_detector(detector_name)
        )
        proposals = detector.detect_events(
            str(resolved_path),
            video_id,
            effective_duration,
        )
        try:
            events = [
                DetectedEventProposal.model_validate(proposal)
                for proposal in proposals
                if proposal.get("label") != "Background"
            ]
        except (ValidationError, AttributeError, TypeError) as error:
            raise EventDetectionInputError("Detector returned invalid event proposals.") from error
        if any(event.end > effective_duration for event in events):
            raise EventDetectionInputError("Detector timestamps exceed video duration.")
        return EventDetectionResponse(events=events)

    def _resolve_video_path(self, stored_path: str) -> Path:
        candidate = Path(stored_path).resolve()
        if not candidate.is_file():
            raise EventDetectionInputError("Uploaded video file is unavailable.")
        return candidate
