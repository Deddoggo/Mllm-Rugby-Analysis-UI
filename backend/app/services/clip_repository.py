"""Atomic JSON persistence for lazily extracted event clips."""

import json
import re
from pathlib import Path
from threading import RLock
from uuid import uuid4

from app.core.config import CLIPS_DIR
from app.schemas.clip import ClipRecord


SAFE_ID = re.compile(r"^[A-Za-z0-9_-]+$")


class ClipNotFoundError(LookupError):
    """Raised when clip metadata or media does not exist."""


class ClipRepository:
    """Keep clip files and metadata behind a database-replaceable interface."""

    def __init__(self, clips_dir: Path = CLIPS_DIR) -> None:
        self.clips_dir = clips_dir
        self._lock = RLock()

    def get_clip(self, video_id: str, clip_id: str) -> ClipRecord | None:
        with self._lock:
            clip = next(
                (item for item in self._read_clips(video_id) if item.clip_id == clip_id),
                None,
            )
            return clip if clip is not None and self.resolve_media_path(clip).is_file() else None

    def find_cached_clip(
        self,
        video_id: str,
        event_id: str,
        start: float,
        end: float,
        profile: str,
    ) -> ClipRecord | None:
        with self._lock:
            return next((
                clip for clip in self._read_clips(video_id)
                if clip.event_id == event_id
                and clip.start == start
                and clip.end == end
                and clip.extraction_profile == profile
                and self.resolve_media_path(clip).is_file()
            ), None)

    def save_clip(self, video_id: str, clip_record: ClipRecord) -> ClipRecord:
        if clip_record.video_id != video_id:
            raise ValueError("Clip video ID does not match its document.")
        with self._lock:
            clips = self._read_clips(video_id)
            clips = [clip for clip in clips if clip.clip_id != clip_record.clip_id]
            clips.append(clip_record)
            self._write_clips(video_id, clips)
        return clip_record

    def list_clips(self, video_id: str) -> list[ClipRecord]:
        with self._lock:
            return [clip for clip in self._read_clips(video_id) if self.resolve_media_path(clip).is_file()]

    def delete_clip(self, video_id: str, clip_id: str) -> None:
        with self._lock:
            clips = self._read_clips(video_id)
            target = next((clip for clip in clips if clip.clip_id == clip_id), None)
            if target is not None:
                self.resolve_media_path(target).unlink(missing_ok=True)
                self._write_clips(video_id, [clip for clip in clips if clip.clip_id != clip_id])

    def clip_directory(self, video_id: str) -> Path:
        self._validate_id(video_id, "video")
        directory = (self.clips_dir / video_id).resolve()
        if not directory.is_relative_to(self.clips_dir.resolve()):
            raise ValueError("Invalid video ID.")
        return directory

    def resolve_media_path(self, record: ClipRecord) -> Path:
        self._validate_id(record.clip_id, "clip")
        candidate = (self.clip_directory(record.video_id) / f"{record.clip_id}.mp4").resolve()
        if not candidate.is_relative_to(self.clips_dir.resolve()):
            raise ValueError("Clip path is outside the clip directory.")
        return candidate

    def _metadata_file(self, video_id: str) -> Path:
        return self.clip_directory(video_id) / "clips.json"

    def _read_clips(self, video_id: str) -> list[ClipRecord]:
        metadata_file = self._metadata_file(video_id)
        if not metadata_file.is_file():
            return []
        try:
            contents = metadata_file.read_text(encoding="utf-8")
            if not contents.strip():
                return []
            payload = json.loads(contents)
            if not isinstance(payload, list):
                return []
            return [
                clip for item in payload
                if (clip := self._parse_clip(item, video_id)) is not None
            ]
        except (json.JSONDecodeError, OSError, TypeError, ValueError):
            return []

    def _parse_clip(self, item: object, video_id: str) -> ClipRecord | None:
        try:
            clip = ClipRecord.model_validate(item)
            return clip if clip.video_id == video_id else None
        except (TypeError, ValueError):
            return None

    def _write_clips(self, video_id: str, clips: list[ClipRecord]) -> None:
        directory = self.clip_directory(video_id)
        directory.mkdir(parents=True, exist_ok=True)
        destination = self._metadata_file(video_id)
        temporary = destination.with_name(f".{destination.name}.{uuid4().hex}.tmp")
        payload = json.dumps([clip.model_dump(mode="json") for clip in clips], indent=2) + "\n"
        try:
            temporary.write_text(payload, encoding="utf-8")
            temporary.replace(destination)
        except OSError:
            temporary.unlink(missing_ok=True)
            raise

    @staticmethod
    def _validate_id(value: str, kind: str) -> None:
        if not SAFE_ID.fullmatch(value):
            raise ValueError(f"Invalid {kind} ID.")
