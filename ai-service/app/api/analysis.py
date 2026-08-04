"""HTTP endpoint for model-independent rugby clip analysis."""

from fastapi import APIRouter, Depends

from app.schemas.analysis import AnalysisQueryRequest, AnalysisQueryResponse
from app.services.analysis_service import AnalysisService
from app.vlm.mock_vlm import MockVLM


router = APIRouter(prefix="/analysis", tags=["analysis"])
analysis_service = AnalysisService(vlm=MockVLM())


def get_analysis_service() -> AnalysisService:
    return analysis_service


@router.post("/query", response_model=AnalysisQueryResponse)
def query_analysis(
    request: AnalysisQueryRequest,
    service: AnalysisService = Depends(get_analysis_service),
) -> AnalysisQueryResponse:
    return service.analyze(request)
