"""Orchestrate lazy, accurately re-encoded event clip extraction."""

import asyncio
import hashlib
import logging
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from uuid import uuid4

from app.core.config import DATA_DIR, REPOSITORY_ROOT
from app.schemas.clip import ClipRecord
from app.schemas.clip_preview import ClipPreviewResponse
from app.schemas.event import VideoEvent
from app.schemas.video import VideoMetadata
from app.services.clip_repository import ClipRepository
from app.services.event_repository import EventRepository
from app.services.ffmpeg import (
    FFmpegExecutionError,
    encoder_available,
    run_clip_ffmpeg,
    run_ffprobe,
)
from app.services.video_metadata import VideoMetadataService


EXTRACTION_PROFILE = "accurate-h264-v1"
MIN_CLIP_DURATION_SECONDS = 2.0
MAX_CLIP_DURATION_SECONDS = 60.0
DURATION_TOLERANCE_SECONDS = 0.5
logger = logging.getLogger("uvicorn.error")
PREVIEW_TTL_SECONDS = 60 * 60


@dataclass(frozen=True)
class PreviewArtifact:
    """Temporary media path paired with its public response."""

    response: ClipPreviewResponse
    path: Path
    created_monotonic: float


class ClipVideoNotFoundError(LookupError):
    """Raised when clip extraction references an unknown video."""


class ClipEventNotFoundError(LookupError):
    """Raised when the persisted selected event does not exist."""


class ClipVideoNotReadyError(RuntimeError):
    """Raised when a processed source is unavailable."""


class InvalidClipBoundariesError(ValueError):
    """Raised when persisted event boundaries cannot produce a valid clip."""


class ClipExtractionError(RuntimeError):
    """Raised when FFmpeg output cannot be created or validated."""


class ClipExtractionService:
    """Resolve authoritative events, cache identities, extraction, and validation."""

    def __init__(
        self,
        metadata_service: VideoMetadataService | None = None,
        event_repository: EventRepository | None = None,
        clip_repository: ClipRepository | None = None,
        repository_root: Path = REPOSITORY_ROOT,
        data_dir: Path = DATA_DIR,
        preview_dir: Path | None = None,
    ) -> None:
        self.metadata_service = metadata_service or VideoMetadataService()
        self.event_repository = event_repository or EventRepository()
        self.clip_repository = clip_repository or ClipRepository()
        self.repository_root = repository_root
        self.data_dir = data_dir
        self._preview_temporary_directory = (
            tempfile.TemporaryDirectory(prefix="rugby-clip-previews-")
            if preview_dir is None
            else None
        )
        self.preview_dir = Path(
            Path(self._preview_temporary_directory.name)
            if self._preview_temporary_directory is not None
            else preview_dir
        )
        self._previews: dict[str, PreviewArtifact] = {}
        self._preview_lock = RLock()

    async def create_clip(
        self,
        video_id: str,
        event_id: str,
        force: bool = False,
    ) -> tuple[ClipRecord, bool]:
        metadata, source_path, event, start, end = self._resolve_extraction_request(
            video_id, event_id
        )
        clip_id = self.make_clip_id(video_id, event_id, start, end, EXTRACTION_PROFILE)

        if not force:
            cached = self.clip_repository.find_cached_clip(
                video_id, event_id, start, end, EXTRACTION_PROFILE
            )
            if cached is not None:
                return cached, True

        clip_directory = self.clip_repository.clip_directory(video_id)
        clip_directory.mkdir(parents=True, exist_ok=True)
        final_path = clip_directory / f"{clip_id}.mp4"
        duration = round(end - start, 3)
        await self._extract_atomic(source_path, final_path, start, duration)

        record = ClipRecord(
            clip_id=clip_id,
            video_id=video_id,
            event_id=event_id,
            event_label=event.label,
            start=start,
            end=end,
            duration=duration,
            status="ready",
            path=self._relative_path(final_path),
            stream_url=f"/videos/{video_id}/clips/{clip_id}/stream",
            extraction_profile=EXTRACTION_PROFILE,
            source_video_path=self._relative_path(source_path),
            created_at=datetime.now(timezone.utc),
        )
        try:
            return self.clip_repository.save_clip(video_id, record), False
        except Exception:
            final_path.unlink(missing_ok=True)
            raise

    async def create_preview(self, video_id: str, event_id: str) -> ClipPreviewResponse:
        """Create a temporary preview without touching persistent clip storage."""
        _, source_path, event, start, end = self._resolve_extraction_request(
            video_id, event_id
        )
        self._cleanup_expired_previews()
        preview_id = f"preview_{uuid4().hex}"
        duration = round(end - start, 3)
        final_path = self.preview_dir / f"{preview_id}.mp4"
        await self._extract_atomic(source_path, final_path, start, duration)
        response = ClipPreviewResponse(
            preview_id=preview_id,
            video_id=video_id,
            event_id=event_id,
            event_label=event.label,
            start=start,
            end=end,
            duration=duration,
            stream_url=f"/videos/{video_id}/clips/preview/{preview_id}/stream",
        )
        with self._preview_lock:
            self._previews[preview_id] = PreviewArtifact(
                response=response,
                path=final_path,
                created_monotonic=time.monotonic(),
            )
        return response

    def get_preview(self, video_id: str, preview_id: str) -> PreviewArtifact | None:
        self._cleanup_expired_previews()
        with self._preview_lock:
            artifact = self._previews.get(preview_id)
            if (
                artifact is None
                or artifact.response.video_id != video_id
                or not artifact.path.is_file()
            ):
                return None
            return artifact

    def delete_preview(self, video_id: str, preview_id: str) -> bool:
        with self._preview_lock:
            artifact = self._previews.get(preview_id)
            if artifact is None or artifact.response.video_id != video_id:
                return False
            self._previews.pop(preview_id, None)
        artifact.path.unlink(missing_ok=True)
        return True

    def get_clip(self, video_id: str, clip_id: str) -> ClipRecord | None:
        self._require_video(video_id)
        return self.clip_repository.get_clip(video_id, clip_id)

    def list_clips(self, video_id: str) -> list[ClipRecord]:
        self._require_video(video_id)
        return self.clip_repository.list_clips(video_id)

    def _resolve_extraction_request(
        self,
        video_id: str,
        event_id: str,
    ) -> tuple[VideoMetadata, Path, VideoEvent, float, float]:
        metadata = self._require_video(video_id)
        source_path = self._require_source(metadata)
        event = self._require_event(video_id, event_id)
        start, end = self._validated_boundaries(event, metadata.duration)
        return metadata, source_path, event, start, end

    async def _extract_atomic(
        self,
        source_path: Path,
        final_path: Path,
        start: float,
        duration: float,
    ) -> None:
        final_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = final_path.with_name(
            f".{final_path.stem}.{uuid4().hex}.tmp.mp4"
        )
        try:
            await self._extract_with_fallback(source_path, temporary_path, start, duration)
            await asyncio.to_thread(self._validate_output, temporary_path, duration)
            temporary_path.replace(final_path)
        except (FFmpegExecutionError, OSError, ClipExtractionError) as error:
            temporary_path.unlink(missing_ok=True)
            if isinstance(error, ClipExtractionError):
                raise
            raise ClipExtractionError(str(error)) from error

    def _cleanup_expired_previews(self) -> None:
        cutoff = time.monotonic() - PREVIEW_TTL_SECONDS
        with self._preview_lock:
            expired = [
                preview_id
                for preview_id, artifact in self._previews.items()
                if artifact.created_monotonic < cutoff or not artifact.path.is_file()
            ]
            artifacts = [self._previews.pop(preview_id) for preview_id in expired]
        for artifact in artifacts:
            artifact.path.unlink(missing_ok=True)

    async def _extract_with_fallback(
        self,
        source_path: Path,
        output_path: Path,
        start: float,
        duration: float,
    ) -> None:
        use_nvenc = await asyncio.to_thread(encoder_available, "h264_nvenc")
        encoders = ("h264_nvenc", "libx264") if use_nvenc else ("libx264",)
        last_error: FFmpegExecutionError | None = None
        for encoder in encoders:
            try:
                logger.info("Clip encoder selected encoder=%s", encoder)
                await asyncio.to_thread(
                    run_clip_ffmpeg,
                    source_path,
                    output_path,
                    start,
                    duration,
                    encoder,
                )
                return
            except FFmpegExecutionError as error:
                output_path.unlink(missing_ok=True)
                last_error = error
                if encoder == "h264_nvenc":
                    logger.warning("NVENC clip extraction failed; falling back to libx264")
        assert last_error is not None
        raise last_error

    @staticmethod
    def _validate_output(output_path: Path, requested_duration: float) -> None:
        if not output_path.is_file() or output_path.stat().st_size <= 0:
            raise ClipExtractionError("FFmpeg did not create a valid clip file.")
        try:
            details = run_ffprobe(output_path)
            streams = details.get("streams", [])
            format_details = details.get("format", {})
            video_stream = next(
                (stream for stream in streams if stream.get("codec_type") == "video"),
                None,
            )
            audio_stream = next(
                (stream for stream in streams if stream.get("codec_type") == "audio"),
                None,
            )
            actual_duration = float(format_details.get("duration"))
            format_names = str(format_details.get("format_name", "")).split(",")
        except (AttributeError, TypeError, ValueError, StopIteration, FFmpegExecutionError) as error:
            raise ClipExtractionError("The generated clip could not be validated.") from error
        if video_stream is None or video_stream.get("codec_name") != "h264":
            raise ClipExtractionError("The generated clip is not H.264 video.")
        if "mp4" not in format_names or actual_duration <= 0:
            raise ClipExtractionError("The generated clip is not a valid MP4.")
        if abs(actual_duration - requested_duration) > DURATION_TOLERANCE_SECONDS:
            raise ClipExtractionError("The generated clip duration does not match the event.")
        if audio_stream is not None and audio_stream.get("codec_name") != "aac":
            raise ClipExtractionError("The generated clip audio is not AAC.")

    def _require_video(self, video_id: str) -> VideoMetadata:
        try:
            metadata = self.metadata_service.get_by_id(video_id)
        except (RuntimeError, ValueError) as error:
            raise ClipExtractionError("Video metadata could not be read.") from error
        if metadata is None:
            raise ClipVideoNotFoundError(f"Video not found: {video_id}")
        return metadata

    def _require_source(self, metadata: VideoMetadata) -> Path:
        if metadata.status != "processed" or not metadata.processed_path:
            raise ClipVideoNotReadyError("Video preprocessing is not complete.")
        source_path = self._resolve_source_path(metadata.processed_path)
        if not source_path.is_relative_to(self.data_dir.resolve()) or not source_path.is_file():
            raise ClipVideoNotReadyError("Processed video file is unavailable.")
        return source_path

    def _resolve_source_path(self, stored_path: str) -> Path:
        return (self.repository_root / stored_path).resolve()

    def _relative_path(self, path: Path) -> str:
        return path.resolve().relative_to(self.repository_root.resolve()).as_posix()

    def _require_event(self, video_id: str, event_id: str) -> VideoEvent:
        document = self.event_repository.get_events(video_id)
        if document is None:
            raise ClipEventNotFoundError(f"Event not found: {event_id}")
        event = next((item for item in document.events if item.id == event_id), None)
        if event is None or event.video_id != video_id:
            raise ClipEventNotFoundError(f"Event not found: {event_id}")
        return event

    @staticmethod
    def _validated_boundaries(event: VideoEvent, video_duration: float | None) -> tuple[float, float]:
        if video_duration is None or video_duration <= 0:
            raise InvalidClipBoundariesError("Video duration is unavailable or invalid.")
        start = round(event.start, 3)
        end = round(event.end, 3)
        duration = round(end - start, 3)
        if start < 0 or end <= start:
            raise InvalidClipBoundariesError("Event boundaries are invalid.")
        if duration < MIN_CLIP_DURATION_SECONDS or duration > MAX_CLIP_DURATION_SECONDS:
            raise InvalidClipBoundariesError("Event duration must be between 2 and 60 seconds.")
        if end > round(video_duration, 3):
            raise InvalidClipBoundariesError("Event end exceeds the source video duration.")
        return start, end

    @staticmethod
    def make_clip_id(
        video_id: str,
        event_id: str,
        start: float,
        end: float,
        profile: str,
    ) -> str:
        identity = f"{video_id}|{event_id}|{start:.3f}|{end:.3f}|{profile}"
        suffix = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:8]
        return f"clip_{event_id}_{suffix}"
