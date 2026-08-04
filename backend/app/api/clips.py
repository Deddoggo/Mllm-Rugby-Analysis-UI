"""HTTP endpoints for lazy event clip extraction and playback."""

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import FileResponse

from app.schemas.clip import ClipCreateRequest, ClipCreateResponse, ClipListResponse, ClipRecord
from app.schemas.clip_preview import ClipPreviewRequest, ClipPreviewResponse
from app.services.clip_extraction import (
    ClipEventNotFoundError,
    ClipExtractionError,
    ClipExtractionService,
    ClipVideoNotFoundError,
    ClipVideoNotReadyError,
    InvalidClipBoundariesError,
)
from app.services.media_streaming import media_file_response


router = APIRouter(prefix="/videos", tags=["clips"])
clip_extraction_service = ClipExtractionService()


def public_clip(record: ClipRecord, cached: bool) -> ClipCreateResponse:
    """Remove internal filesystem paths from the public representation."""
    return ClipCreateResponse(
        **record.model_dump(exclude={"path", "source_video_path"}),
        cached=cached,
    )


def raise_clip_http_error(error: Exception) -> None:
    if isinstance(error, (ClipVideoNotFoundError, ClipEventNotFoundError)):
        raise HTTPException(status_code=404, detail=str(error)) from error
    if isinstance(error, ClipVideoNotReadyError):
        raise HTTPException(status_code=409, detail=str(error)) from error
    if isinstance(error, InvalidClipBoundariesError):
        raise HTTPException(status_code=422, detail=str(error)) from error
    if isinstance(error, (ValueError, ClipExtractionError)):
        raise HTTPException(status_code=500, detail=str(error)) from error
    raise error


@router.post(
    "/{video_id}/clips",
    response_model=ClipCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_clip(video_id: str, request: ClipCreateRequest) -> ClipCreateResponse:
    try:
        record, cached = await clip_extraction_service.create_clip(
            video_id,
            request.event_id,
            force=request.force,
        )
        return public_clip(record, cached)
    except Exception as error:
        raise_clip_http_error(error)
        raise


@router.post(
    "/{video_id}/clips/preview",
    response_model=ClipPreviewResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_clip_preview(
    video_id: str,
    request: ClipPreviewRequest,
) -> ClipPreviewResponse:
    try:
        return await clip_extraction_service.create_preview(video_id, request.event_id)
    except Exception as error:
        raise_clip_http_error(error)
        raise


@router.get(
    "/{video_id}/clips/preview/{preview_id}/stream",
    response_class=FileResponse,
)
async def stream_clip_preview(video_id: str, preview_id: str) -> FileResponse:
    artifact = clip_extraction_service.get_preview(video_id, preview_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail="Clip preview not found.")
    return media_file_response(artifact.path, "video/mp4")


@router.delete(
    "/{video_id}/clips/preview/{preview_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_clip_preview(video_id: str, preview_id: str) -> Response:
    clip_extraction_service.delete_preview(video_id, preview_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{video_id}/clips", response_model=ClipListResponse)
async def list_clips(video_id: str) -> ClipListResponse:
    try:
        records = clip_extraction_service.list_clips(video_id)
        return ClipListResponse(
            video_id=video_id,
            clips=[public_clip(record, cached=True) for record in records],
        )
    except Exception as error:
        raise_clip_http_error(error)
        raise


@router.get("/{video_id}/clips/{clip_id}", response_model=ClipCreateResponse)
async def get_clip(video_id: str, clip_id: str) -> ClipCreateResponse:
    try:
        record = clip_extraction_service.get_clip(video_id, clip_id)
        if record is None:
            raise ClipEventNotFoundError(f"Clip not found: {clip_id}")
        return public_clip(record, cached=True)
    except Exception as error:
        raise_clip_http_error(error)
        raise


@router.get("/{video_id}/clips/{clip_id}/stream", response_class=FileResponse)
async def stream_clip(video_id: str, clip_id: str) -> FileResponse:
    try:
        record = clip_extraction_service.get_clip(video_id, clip_id)
        if record is None:
            raise ClipEventNotFoundError(f"Clip not found: {clip_id}")
        path = clip_extraction_service.clip_repository.resolve_media_path(record)
        return media_file_response(path, "video/mp4")
    except Exception as error:
        raise_clip_http_error(error)
        raise
