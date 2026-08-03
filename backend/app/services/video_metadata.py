"""JSON-backed repository for persistent video metadata."""

import json
from pathlib import Path
from threading import RLock

from app.schemas.video import VideoMetadata
from app.core.config import VIDEO_METADATA_FILE


class VideoMetadataService:
    """Provide a storage-agnostic interface for video metadata lookups."""

    def __init__(self, metadata_file: Path = VIDEO_METADATA_FILE) -> None:
        self.metadata_file = metadata_file
        self._lock = RLock()

    def get_by_hash(self, sha256: str) -> VideoMetadata | None:
        with self._lock:
            return next(
                (video for video in self._read_videos() if video.sha256 == sha256),
                None,
            )

    def get_by_id(self, video_id: str) -> VideoMetadata | None:
        with self._lock:
            return next(
                (video for video in self._read_videos() if video.video_id == video_id),
                None,
            )

    def add_video(self, metadata: VideoMetadata) -> VideoMetadata:
        """Persist metadata, or return the existing record for the same hash."""
        with self._lock:
            videos = self._read_videos()
            existing = next(
                (video for video in videos if video.sha256 == metadata.sha256),
                None,
            )
            if existing is not None:
                return existing
            videos.append(metadata)
            self._write_videos(videos)
            return metadata

    def list_videos(self) -> list[VideoMetadata]:
        with self._lock:
            return list(self._read_videos())

    def update_video(self, metadata: VideoMetadata) -> VideoMetadata:
        """Replace an existing record after a processing state transition."""
        with self._lock:
            videos = self._read_videos()
            for index, video in enumerate(videos):
                if video.video_id == metadata.video_id:
                    videos[index] = metadata
                    self._write_videos(videos)
                    return metadata
            raise RuntimeError(f"Video metadata not found: {metadata.video_id}")

    def remove_by_id(self, video_id: str) -> None:
        """Remove stale metadata whose underlying file no longer exists."""
        with self._lock:
            videos = self._read_videos()
            retained = [video for video in videos if video.video_id != video_id]
            if len(retained) != len(videos):
                self._write_videos(retained)

    def _read_videos(self) -> list[VideoMetadata]:
        if not self.metadata_file.exists():
            return []
        try:
            payload = json.loads(self.metadata_file.read_text(encoding="utf-8"))
            if not isinstance(payload, list):
                raise ValueError("Video metadata must be a JSON array.")
            return [VideoMetadata.model_validate(item) for item in payload]
        except (json.JSONDecodeError, OSError, ValueError, TypeError) as error:
            raise RuntimeError("Video metadata storage could not be read.") from error

    def _write_videos(self, videos: list[VideoMetadata]) -> None:
        self.metadata_file.parent.mkdir(parents=True, exist_ok=True)
        temporary_file = self.metadata_file.with_suffix(".json.tmp")
        payload = [video.model_dump(mode="json") for video in videos]
        try:
            temporary_file.write_text(
                json.dumps(payload, indent=2) + "\n",
                encoding="utf-8",
            )
            temporary_file.replace(self.metadata_file)
        except OSError as error:
            temporary_file.unlink(missing_ok=True)
            raise RuntimeError("Video metadata storage could not be written.") from error
