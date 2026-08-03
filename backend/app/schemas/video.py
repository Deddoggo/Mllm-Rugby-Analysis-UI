"""Typed video metadata and API response schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, model_validator


VideoProcessingStatus = Literal["uploaded", "processing", "processed", "failed"]


class VideoMetadata(BaseModel):
    """Persistent metadata for one uniquely stored video."""

    video_id: str
    filename: str
    sha256: str
    duration: float | None
    size: int
    original_path: str
    processed_path: str | None = None
    status: VideoProcessingStatus = "uploaded"
    error: str | None = None
    created_at: datetime

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_path(cls, value: object) -> object:
        """Read metadata written before original/processed paths were separated."""
        if isinstance(value, dict) and "original_path" not in value and "path" in value:
            migrated = dict(value)
            migrated["original_path"] = migrated.pop("path")
            return migrated
        return value


class VideoUploadResponse(BaseModel):
    """Public upload response without internal storage details."""

    video_id: str
    filename: str
    status: Literal["processed", "already_exists"]
    stream_url: str
    duration: float | None
    size: int
