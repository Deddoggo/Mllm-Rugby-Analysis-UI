"""HTTP endpoints for rugby match video uploads and playback."""

import asyncio
from datetime import datetime, timezone
import logging
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from pydantic import ValidationError
from fastapi.responses import FileResponse

from app.schemas.video import VideoMetadata, VideoUploadResponse
from app.schemas.analysis_config import AnalysisConfig
from app.services.storage import (
    calculate_sha256,
    delete_video,
    probe_duration,
    relative_video_path,
    resolve_original_video_path,
    save_video,
)
from app.services.video_metadata import VideoMetadataService
from app.services.media_streaming import media_file_response
from app.services.video_processing import (
    VideoProcessingError,
    check_video_format,
    generate_processed_path,
    normalize_video,
)


router = APIRouter(prefix="/videos", tags=["videos"])
SUPPORTED_EXTENSIONS = {"mp4", "mov", "mkv"}
metadata_service = VideoMetadataService()
logger = logging.getLogger("uvicorn.error")


def upload_response(
    metadata: VideoMetadata,
    upload_status: Literal["processed", "already_exists"],
) -> VideoUploadResponse:
    """Build the stable public representation of stored video metadata."""
    response = VideoUploadResponse(
        video_id=metadata.video_id,
        filename=metadata.filename,
        status=upload_status,
        stream_url=f"/videos/{metadata.video_id}/stream",
        duration=metadata.duration,
        size=metadata.size,
    )
    logger.info(
        "Video upload response returned video_id=%s status=%s",
        metadata.video_id,
        upload_status,
    )
    return response


async def preprocess_video(
    metadata: VideoMetadata,
    original_path: Path,
) -> VideoMetadata:
    """Persist processing transitions around FFmpeg normalization."""
    logger.info("Video preprocessing started video_id=%s", metadata.video_id)
    processing = metadata.model_copy(
        update={"status": "processing", "error": None}
    )
    metadata_service.update_video(processing)
    logger.info(
        "Video metadata updated video_id=%s status=processing",
        metadata.video_id,
    )
    processed_path = generate_processed_path(metadata.video_id)

    try:
        video_format = await check_video_format(original_path)
        logger.info(
            "Video format detected video_id=%s container=%s video_codec=%s audio_codec=%s pixel_format=%s",
            metadata.video_id,
            video_format.container,
            video_format.video_codec,
            video_format.audio_codec or "none",
            video_format.pixel_format,
        )
        if video_format.is_normalized:
            final_path = original_path
            logger.info(
                "Video transcoding skipped video_id=%s reason=already_normalized",
                metadata.video_id,
            )
        else:
            await normalize_video(original_path, processed_path, video_format)
            final_path = processed_path
    except VideoProcessingError as error:
        failed = processing.model_copy(
            update={"status": "failed", "error": str(error)}
        )
        metadata_service.update_video(failed)
        logger.error(
            "Video preprocessing failed video_id=%s error=%s",
            metadata.video_id,
            error,
        )
        logger.info(
            "Video metadata updated video_id=%s status=failed",
            metadata.video_id,
        )
        raise

    logger.info("Video preprocessing finished video_id=%s", metadata.video_id)

    processed = processing.model_copy(
        update={
            "processed_path": relative_video_path(final_path),
            "status": "processed",
            "duration": video_format.duration
            if video_format.duration is not None
            else await asyncio.to_thread(probe_duration, final_path),
            "error": None,
        }
    )
    updated = metadata_service.update_video(processed)
    logger.info(
        "Video metadata updated video_id=%s status=processed",
        metadata.video_id,
    )
    return updated


async def finish_existing_video(metadata: VideoMetadata) -> VideoUploadResponse:
    """Return or retry normalization for content already registered by hash."""
    original_path = resolve_original_video_path(metadata.video_id)
    if original_path is None:
        raise VideoProcessingError("The original video file is missing.")
    processed_path = generate_processed_path(metadata.video_id)
    if metadata.status == "processed":
        uses_original = metadata.processed_path == metadata.original_path
        if (uses_original and original_path.is_file()) or processed_path.is_file():
            return upload_response(metadata, "already_exists")
    processed = await preprocess_video(metadata, original_path)
    return upload_response(processed, "already_exists")


@router.post(
    "/upload",
    status_code=status.HTTP_201_CREATED,
    response_model=VideoUploadResponse,
)
async def upload_video(
    video: UploadFile = File(...),
    analysis_config: str | None = Form(default=None),
) -> VideoUploadResponse:
    """Validate and persist one uploaded match video."""
    try:
        selected_config = (
            AnalysisConfig.model_validate_json(analysis_config)
            if analysis_config
            else AnalysisConfig()
        )
    except ValidationError as error:
        await video.close()
        raise HTTPException(
            status_code=422,
            detail="Invalid analysis_config multipart field.",
        ) from error
    original_filename = Path((video.filename or "").replace("\\", "/")).name
    extension = Path(original_filename).suffix.lower().lstrip(".")
    logger.info(
        "Video upload started filename=%s event_detector=%s",
        original_filename or "<missing>",
        selected_config.event_detector,
    )

    if not original_filename:
        await video.close()
        raise HTTPException(status_code=400, detail="A video file is required.")
    if extension not in SUPPORTED_EXTENSIONS:
        await video.close()
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported video format. Use mp4, mov, or mkv.",
        )

    try:
        sha256 = await calculate_sha256(video)
    except ValueError as error:
        await video.close()
        raise HTTPException(status_code=400, detail=str(error)) from error

    existing = metadata_service.get_by_hash(sha256)
    if existing is not None:
        logger.info(
            "Duplicate video detected filename=%s video_id=%s",
            original_filename,
            existing.video_id,
        )
        if resolve_original_video_path(existing.video_id) is not None:
            await video.close()
            try:
                return await finish_existing_video(existing)
            except VideoProcessingError as error:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=f"Video {existing.video_id} preprocessing failed: {error}",
                ) from error
        metadata_service.remove_by_id(existing.video_id)

    try:
        video_id, stored_path, file_size = await save_video(video, extension)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    logger.info(
        "Video file saved video_id=%s path=%s size=%s",
        video_id,
        relative_video_path(stored_path),
        file_size,
    )

    metadata = VideoMetadata(
        video_id=video_id,
        filename=original_filename,
        sha256=sha256,
        duration=None,
        size=file_size,
        original_path=relative_video_path(stored_path),
        processed_path=None,
        status="uploaded",
        created_at=datetime.now(timezone.utc),
    )
    try:
        registered = metadata_service.add_video(metadata)
    except RuntimeError:
        delete_video(stored_path)
        raise
    logger.info(
        "Video metadata updated video_id=%s status=%s",
        registered.video_id,
        registered.status,
    )

    if registered.video_id != metadata.video_id:
        delete_video(stored_path)
        try:
            return await finish_existing_video(registered)
        except VideoProcessingError as error:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Video {registered.video_id} preprocessing failed: {error}",
            ) from error

    try:
        processed = await preprocess_video(registered, stored_path)
    except VideoProcessingError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Video {registered.video_id} preprocessing failed: {error}",
        ) from error
    return upload_response(processed, "processed")


@router.get("/{video_id}/stream", response_class=FileResponse)
async def stream_video(video_id: str) -> FileResponse:
    """Stream a stored video with browser-compatible range request support."""
    metadata = metadata_service.get_by_id(video_id)
    try:
        processed_path = generate_processed_path(video_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Video not found.") from error
    stored_path = (
        processed_path
        if metadata is not None
        and metadata.status == "processed"
        and processed_path.is_file()
        else resolve_original_video_path(video_id)
    )
    if stored_path is None:
        raise HTTPException(status_code=404, detail="Video not found.")

    media_types = {
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".mkv": "video/x-matroska",
    }
    return media_file_response(stored_path, media_types[stored_path.suffix.lower()])
