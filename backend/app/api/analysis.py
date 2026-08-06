"""Validated analysis gateway from persistent clips to the AI service."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from app.schemas.analysis import (
    AIServiceAnalysisRequest,
    AnalysisGatewayResponse,
    AnalysisQuestionRequest,
    ConversationDeleteResponse,
    ConversationHistoryResponse,
)
from app.services.ai_client import (
    AIServiceClient,
    AIServiceProtocolError,
    AIServiceUnavailableError,
)
from app.services.clip_repository import ClipRepository
from app.services.video_metadata import VideoMetadataService


LOGGER = logging.getLogger(__name__)
router = APIRouter(prefix="/videos", tags=["analysis"])
metadata_service = VideoMetadataService()
clip_repository = ClipRepository()
ai_client = AIServiceClient()


def _public_model_data(value: object, fields: tuple[str, ...]) -> dict[str, Any]:
    """Serialize only context fields safe to send across the service boundary."""
    return {
        field: item
        for field in fields
        if (item := getattr(value, field, None)) is not None
    }


@router.post(
    "/{video_id}/clips/{clip_id}/analysis",
    response_model=AnalysisGatewayResponse,
)
async def analyze_clip(
    video_id: str,
    clip_id: str,
    request: AnalysisQuestionRequest,
) -> AnalysisGatewayResponse:
    try:
        video = metadata_service.get_by_id(video_id)
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found.")

    try:
        clip = clip_repository.get_clip(video_id, clip_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Clip not found.") from error
    if clip is None:
        raise HTTPException(status_code=404, detail="Clip not found.")

    try:
        clip_path = clip_repository.resolve_media_path(clip)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Clip not found.") from error
    if not clip_path.is_file():
        raise HTTPException(status_code=404, detail="Clip not found.")

    metadata = {
        "video": _public_model_data(
            video,
            ("video_id", "filename", "duration", "size", "status"),
        ),
        "event": {
            "id": clip.event_id,
            "video_id": video.video_id,
            "label": getattr(clip, "event_label", "Unknown"),
            "start": getattr(clip, "start", 0),
            "end": getattr(clip, "end", 0),
        },
        "clip": _public_model_data(
            clip,
            (
                "clip_id",
                "video_id",
                "event_id",
                "event_label",
                "start",
                "end",
                "duration",
                "status",
                "extraction_profile",
            ),
        ),
    }

    try:
        return await ai_client.analyze(
            AIServiceAnalysisRequest(
                video_id=video.video_id,
                event_id=clip.event_id,
                clip_id=clip.clip_id,
                question=request.question,
                mode=request.mode,
            ),
            clip_path,
            metadata,
        )
    except AIServiceUnavailableError as error:
        LOGGER.exception(
            "Analysis gateway could not reach AI service: video_id=%s clip_id=%s",
            video_id,
            clip_id,
        )
        raise HTTPException(status_code=503, detail=str(error)) from error
    except AIServiceProtocolError as error:
        LOGGER.exception(
            "Analysis gateway received an invalid AI service response: "
            "video_id=%s clip_id=%s",
            video_id,
            clip_id,
        )
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.get(
    "/{video_id}/clips/{clip_id}/analysis",
    response_model=ConversationHistoryResponse,
)
async def get_clip_conversation(
    video_id: str,
    clip_id: str,
) -> ConversationHistoryResponse:
    try:
        video = metadata_service.get_by_id(video_id)
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found.")

    try:
        clip = clip_repository.get_clip(video_id, clip_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Clip not found.") from error
    if clip is None:
        raise HTTPException(status_code=404, detail="Clip not found.")

    try:
        return await ai_client.get_conversation(
            video.video_id,
            clip.event_id,
            clip.clip_id,
        )
    except AIServiceUnavailableError as error:
        LOGGER.exception(
            "Conversation gateway could not reach AI service: "
            "video_id=%s clip_id=%s",
            video_id,
            clip_id,
        )
        raise HTTPException(status_code=503, detail=str(error)) from error
    except AIServiceProtocolError as error:
        LOGGER.exception(
            "Conversation gateway received an invalid AI service response: "
            "video_id=%s clip_id=%s",
            video_id,
            clip_id,
        )
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.delete(
    "/{video_id}/clips/{clip_id}/analysis",
    response_model=ConversationDeleteResponse,
)
async def delete_clip_conversation(
    video_id: str,
    clip_id: str,
) -> ConversationDeleteResponse:
    try:
        video = metadata_service.get_by_id(video_id)
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found.")

    try:
        clip = clip_repository.get_clip(video_id, clip_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Clip not found.") from error
    if clip is None:
        raise HTTPException(status_code=404, detail="Clip not found.")

    try:
        return await ai_client.delete_conversation(
            video.video_id,
            clip.event_id,
            clip.clip_id,
        )
    except AIServiceUnavailableError as error:
        LOGGER.exception(
            "Conversation deletion could not reach AI service: "
            "video_id=%s clip_id=%s",
            video_id,
            clip_id,
        )
        raise HTTPException(status_code=503, detail=str(error)) from error
    except AIServiceProtocolError as error:
        LOGGER.exception(
            "Conversation deletion received an invalid AI service response: "
            "video_id=%s clip_id=%s",
            video_id,
            clip_id,
        )
        raise HTTPException(status_code=502, detail=str(error)) from error
