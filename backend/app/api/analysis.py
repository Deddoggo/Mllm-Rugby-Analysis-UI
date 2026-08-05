"""Validated analysis gateway from persistent clips to the AI service."""

import logging

from fastapi import APIRouter, HTTPException

from app.schemas.analysis import (
    AIServiceAnalysisRequest,
    AnalysisGatewayResponse,
    AnalysisQuestionRequest,
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
        return await ai_client.analyze(AIServiceAnalysisRequest(
            video_id=video.video_id,
            event_id=clip.event_id,
            clip_id=clip.clip_id,
            question=request.question,
        ))
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
