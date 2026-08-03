"""Filesystem storage operations for uploaded videos."""

import hashlib
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import DATA_DIR, ORIGINAL_VIDEO_DIR
from app.services.ffmpeg import FFmpegExecutionError, run_ffprobe

CHUNK_SIZE = 1024 * 1024
HASH_CHUNK_SIZE = 8 * 1024 * 1024


def create_video_id() -> str:
    """Create a human-readable, unique identifier for a video upload."""
    date = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"match_{date}_{uuid4().hex[:8]}"


async def calculate_sha256(video: UploadFile) -> str:
    """Hash an upload incrementally and rewind it for subsequent storage."""
    digest = hashlib.sha256()
    size = 0
    try:
        while chunk := await video.read(HASH_CHUNK_SIZE):
            digest.update(chunk)
            size += len(chunk)
    finally:
        await video.seek(0)

    if size == 0:
        raise ValueError("The uploaded video is empty.")
    return digest.hexdigest()


async def save_video(video: UploadFile, extension: str) -> tuple[str, Path, int]:
    """Stream an uploaded video to the repository data directory."""
    ORIGINAL_VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    video_id = create_video_id()
    destination = ORIGINAL_VIDEO_DIR / f"{video_id}_original.{extension}"
    size = 0

    try:
        with destination.open("wb") as output:
            while chunk := await video.read(CHUNK_SIZE):
                output.write(chunk)
                size += len(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await video.close()

    if size == 0:
        destination.unlink(missing_ok=True)
        raise ValueError("The uploaded video is empty.")

    return video_id, destination, size


def resolve_original_video_path(video_id: str) -> Path | None:
    """Resolve a video ID to its immutable original, including legacy names."""
    if not video_id.startswith("match_") or not video_id.replace("_", "").isalnum():
        return None

    for extension in ("mp4", "mov", "mkv"):
        for filename in (f"{video_id}_original.{extension}", f"{video_id}.{extension}"):
            candidate = ORIGINAL_VIDEO_DIR / filename
            if candidate.is_file():
                return candidate
    return None


def relative_video_path(path: Path) -> str:
    """Return a portable path relative to the runtime data directory's parent."""
    return path.relative_to(DATA_DIR.parent).as_posix()


def delete_video(path: Path) -> None:
    """Remove a newly stored video when metadata registration loses a race."""
    path.unlink(missing_ok=True)


def probe_duration(path: str | Path) -> float | None:
    try:
        details = run_ffprobe(path)
        duration = details.get("format", {}).get("duration")
        return float(duration) if duration is not None else None
    except (FFmpegExecutionError, TypeError, ValueError, AttributeError):
        return None
