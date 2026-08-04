"""Validated analysis gateway from persistent clips to the AI service."""

from fastapi import APIRouter, HTTPException

from app.schemas.analysis import (
    AIServiceAnalysisRequest,
    AnalysisGatewayResponse,
    AnalysisQuestionRequest,
)
from app.services.ai_client import (
    AIServiceClient,
    AIServiceProtocolError,
    AIServiceUnavailableError,
)
from app.services.clip_repository import ClipRepository
from app.services.video_metadata import VideoMetadataService


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
        raise HTTPException(status_code=503, detail=str(error)) from error
    except AIServiceProtocolError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
