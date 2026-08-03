"""Atomic JSON persistence for detected rugby events."""

import json
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from uuid import uuid4

from app.core.config import EVENTS_DIR
from app.schemas.event import (
    EventBoundaryUpdateRequest,
    EventDetectionResponse,
    EventListResponse,
    VideoEvent,
)


class EventNotFoundError(LookupError):
    """Raised when an event document or event identifier does not exist."""


class EventRepository:
    """Store event documents behind a database-replaceable interface."""

    def __init__(self, events_dir: Path = EVENTS_DIR) -> None:
        self.events_dir = events_dir
        self._lock = RLock()

    def get_events(self, video_id: str) -> EventListResponse | None:
        """Return stored events, treating absent, empty, or malformed files as missing."""
        with self._lock:
            return self._read_document(video_id)

    def save_events(
        self,
        video_id: str,
        events: list[VideoEvent],
        detector: str,
        status: str = "ready",
    ) -> EventDetectionResponse:
        if status != "ready":
            raise ValueError("Stored event status must be ready.")
        document = EventDetectionResponse(
            video_id=video_id,
            status="ready",
            detector=detector,
            created_at=datetime.now(timezone.utc),
            events=events,
        )
        with self._lock:
            self._write_document(video_id, document)
        return document

    def events_exist(self, video_id: str) -> bool:
        with self._lock:
            return self._read_document(video_id) is not None

    def update_event(
        self,
        video_id: str,
        event_id: str,
        start: float,
        end: float,
    ) -> VideoEvent:
        boundaries = EventBoundaryUpdateRequest(start=start, end=end)
        with self._lock:
            document = self._read_document(video_id)
            if document is None:
                raise EventNotFoundError(f"No events exist for video: {video_id}")
            for index, event in enumerate(document.events):
                if event.id == event_id:
                    updated = VideoEvent.model_validate(
                        event.model_copy(
                            update={
                                "start": boundaries.start,
                                "end": boundaries.end,
                                "adjusted": True,
                            }
                        )
                    )
                    document.events[index] = updated
                    self._write_document(video_id, document)
                    return updated
        raise EventNotFoundError(f"Event not found: {event_id}")

    def delete_events(self, video_id: str) -> None:
        with self._lock:
            self._event_file(video_id).unlink(missing_ok=True)

    def _event_file(self, video_id: str) -> Path:
        if not video_id.startswith("match_") or not video_id.replace("_", "").isalnum():
            raise ValueError("Invalid video ID.")
        return self.events_dir / f"{video_id}.json"

    def _read_document(self, video_id: str) -> EventListResponse | None:
        event_file = self._event_file(video_id)
        if not event_file.is_file():
            return None
        try:
            contents = event_file.read_text(encoding="utf-8")
            if not contents.strip():
                return None
            document = EventDetectionResponse.model_validate(json.loads(contents))
            if document.video_id != video_id:
                return None
            return document
        except (json.JSONDecodeError, OSError, TypeError, ValueError):
            return None

    def _write_document(
        self,
        video_id: str,
        document: EventListResponse,
    ) -> None:
        self.events_dir.mkdir(parents=True, exist_ok=True)
        destination = self._event_file(video_id)
        temporary = destination.with_name(f".{destination.name}.{uuid4().hex}.tmp")
        payload = json.dumps(document.model_dump(mode="json"), indent=2) + "\n"
        try:
            temporary.write_text(payload, encoding="utf-8")
            temporary.replace(destination)
        except OSError:
            temporary.unlink(missing_ok=True)
            raise
