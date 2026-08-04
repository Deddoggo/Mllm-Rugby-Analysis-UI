"""Read-only assembly of existing backend event and clip metadata."""

import json
import re
from pathlib import Path
from typing import Any

from app.core.config import settings


SAFE_ID = re.compile(r"^[A-Za-z0-9_-]+$")


class ContextBuilder:
    """Consume backend JSON contracts without owning persistence logic."""

    def __init__(
        self,
        events_dir: Path = settings.events_dir,
        clips_dir: Path = settings.clips_dir,
    ) -> None:
        self.events_dir = events_dir.resolve()
        self.clips_dir = clips_dir.resolve()

    def build(
        self,
        video_id: str,
        event_id: str,
        clip_id: str,
        question: str,
    ) -> dict[str, Any]:
        """Return available public context plus an internal resolved clip path."""
        self._validate_id(video_id)
        self._validate_id(event_id)
        self._validate_id(clip_id)
        event = self._find_event(video_id, event_id)
        clip = self._find_clip(video_id, event_id, clip_id)
        clip_path = self._resolve_clip_path(video_id, clip_id) if clip else ""
        return {
            "event": event,
            "clip": clip,
            "question": question,
            "_clip_path": clip_path,
        }

    def _find_event(self, video_id: str, event_id: str) -> dict[str, Any]:
        payload = self._read_json(self.events_dir / f"{video_id}.json")
        events = payload.get("events", []) if isinstance(payload, dict) else []
        if not isinstance(events, list):
            return {}
        item = next(
            (
                candidate for candidate in events
                if isinstance(candidate, dict)
                and candidate.get("id") == event_id
                and candidate.get("video_id") == video_id
            ),
            None,
        )
        if item is None:
            return {}
        return {
            key: item[key]
            for key in ("id", "video_id", "label", "start", "end", "confidence", "adjusted")
            if key in item
        }

    def _find_clip(self, video_id: str, event_id: str, clip_id: str) -> dict[str, Any]:
        payload = self._read_json(self.clips_dir / video_id / "clips.json")
        if not isinstance(payload, list):
            return {}
        item = next(
            (
                candidate for candidate in payload
                if isinstance(candidate, dict)
                and candidate.get("clip_id") == clip_id
                and candidate.get("video_id") == video_id
                and candidate.get("event_id") == event_id
            ),
            None,
        )
        if item is None:
            return {}
        return {
            key: item[key]
            for key in (
                "clip_id",
                "video_id",
                "event_id",
                "event_label",
                "start",
                "end",
                "duration",
                "status",
                "extraction_profile",
            )
            if key in item
        }

    def _resolve_clip_path(self, video_id: str, clip_id: str) -> str:
        candidate = (self.clips_dir / video_id / f"{clip_id}.mp4").resolve()
        if candidate.is_relative_to(self.clips_dir) and candidate.is_file():
            return str(candidate)
        return ""

    @staticmethod
    def _read_json(path: Path) -> object:
        if not path.is_file():
            return {}
        try:
            contents = path.read_text(encoding="utf-8")
            return json.loads(contents) if contents.strip() else {}
        except (json.JSONDecodeError, OSError, TypeError, ValueError):
            return {}

    @staticmethod
    def _validate_id(value: str) -> None:
        if not SAFE_ID.fullmatch(value):
            raise ValueError("Invalid context identifier.")
