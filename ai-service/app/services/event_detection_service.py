"""AI-owned detector orchestration over the shared data directory."""

import json
from pathlib import Path

from pydantic import ValidationError

from app.core.config import settings
from app.schemas.event import DetectedEventProposal, EventDetectionResponse
from vjepa2.contracts import EventDetector
from vjepa2.mock_detector import MockVJEPA2Detector


class EventDetectionInputError(ValueError):
    """Raised when shared video input is unavailable or malformed."""


class AIEventDetectionService:
    """Keep detector implementations private to the AI-service process."""

    def __init__(
        self,
        detector: EventDetector | None = None,
        data_dir: Path = settings.data_dir,
        video_metadata_file: Path = settings.video_metadata_file,
    ) -> None:
        self.detector = detector or MockVJEPA2Detector()
        self.data_dir = data_dir.resolve()
        self.video_metadata_file = video_metadata_file.resolve()

    def detect_events(self, video_path: str, video_id: str) -> EventDetectionResponse:
        resolved_path = self._resolve_video_path(video_path)
        duration = self._video_duration(video_id)
        proposals = self.detector.detect_events(str(resolved_path), video_id, duration)
        try:
            events = [
                DetectedEventProposal.model_validate(proposal)
                for proposal in proposals
                if proposal.get("label") != "Background"
            ]
        except (ValidationError, AttributeError, TypeError) as error:
            raise EventDetectionInputError("Detector returned invalid event proposals.") from error
        if any(event.end > duration for event in events):
            raise EventDetectionInputError("Detector timestamps exceed video duration.")
        return EventDetectionResponse(events=events)

    def _resolve_video_path(self, stored_path: str) -> Path:
        candidate = Path(stored_path)
        if not candidate.is_absolute():
            if candidate.parts and candidate.parts[0].lower() == "data":
                candidate = self.data_dir.parent / candidate
            else:
                candidate = self.data_dir / candidate
        candidate = candidate.resolve()
        if not candidate.is_relative_to(self.data_dir) or not candidate.is_file():
            raise EventDetectionInputError("Processed video file is unavailable.")
        return candidate

    def _video_duration(self, video_id: str) -> float:
        try:
            payload = json.loads(self.video_metadata_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, TypeError, ValueError) as error:
            raise EventDetectionInputError("Video metadata is unavailable or invalid.") from error
        if not isinstance(payload, list):
            raise EventDetectionInputError("Video metadata is unavailable or invalid.")
        video = next(
            (
                item for item in payload
                if isinstance(item, dict) and item.get("video_id") == video_id
            ),
            None,
        )
        duration = video.get("duration") if video else None
        if not isinstance(duration, (int, float)) or duration <= 0:
            raise EventDetectionInputError("Video duration is unavailable or invalid.")
        return float(duration)
