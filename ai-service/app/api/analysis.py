"""HTTP endpoint for model-independent rugby clip analysis."""

from fastapi import APIRouter, Depends, HTTPException

from app.schemas.analysis import (
    AnalysisQueryRequest,
    AnalysisQueryResponse,
    ConversationDeleteResponse,
    ConversationHistoryResponse,
)
from app.services.analysis_service import AnalysisProviderError, AnalysisService
from app.core.config import settings
from app.vlm.factory import create_vlm


router = APIRouter(prefix="/analysis", tags=["analysis"])
analysis_service = AnalysisService(vlm=create_vlm(settings))


def get_analysis_service() -> AnalysisService:
    return analysis_service


@router.post("/query", response_model=AnalysisQueryResponse)
def query_analysis(
    request: AnalysisQueryRequest,
    service: AnalysisService = Depends(get_analysis_service),
) -> AnalysisQueryResponse:
    try:
        return service.analyze(request)
    except AnalysisProviderError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.get(
    "/conversations/{video_id}/{event_id}/{clip_id}",
    response_model=ConversationHistoryResponse,
)
def get_conversation(
    video_id: str,
    event_id: str,
    clip_id: str,
    service: AnalysisService = Depends(get_analysis_service),
) -> ConversationHistoryResponse:
    return service.get_conversation(video_id, event_id, clip_id)


@router.delete(
    "/conversations/{video_id}/{event_id}/{clip_id}",
    response_model=ConversationDeleteResponse,
)
def delete_conversation(
    video_id: str,
    event_id: str,
    clip_id: str,
    service: AnalysisService = Depends(get_analysis_service),
) -> ConversationDeleteResponse:
    return service.delete_conversation(video_id, event_id, clip_id)
