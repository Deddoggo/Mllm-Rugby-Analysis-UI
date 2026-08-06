"""HTTP endpoint for model-independent rugby clip analysis."""

import asyncio
import json
from pathlib import Path
import tempfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import ValidationError

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
async def query_analysis(
    video: UploadFile = File(...),
    question: str = Form(..., min_length=1, max_length=4000),
    history: str = Form("[]"),
    metadata: str = Form("{}"),
    conversation: str = Form(...),
    service: AnalysisService = Depends(get_analysis_service),
) -> AnalysisQueryResponse:
    temporary_path: Path | None = None
    try:
        history_payload = json.loads(history)
        metadata_payload = json.loads(metadata)
        conversation_payload = json.loads(conversation)
        if not isinstance(history_payload, list):
            raise ValueError("history must be a list")
        if not isinstance(metadata_payload, dict):
            raise ValueError("metadata must be an object")
        if any(
            not isinstance(metadata_payload.get(section, {}), dict)
            for section in ("video", "event", "clip")
        ):
            raise ValueError("metadata sections must be objects")
        if not isinstance(conversation_payload, dict):
            raise ValueError("conversation must be an object")
        request = AnalysisQueryRequest.model_validate({
            **conversation_payload,
            "question": question,
        })
        sanitized_history = [
            {"role": item["role"], "content": item["content"]}
            for item in history_payload
            if isinstance(item, dict)
            and item.get("role") in {"user", "assistant"}
            and isinstance(item.get("content"), str)
        ]
    except (json.JSONDecodeError, ValidationError, ValueError, TypeError) as error:
        await video.close()
        raise HTTPException(status_code=422, detail="Invalid analysis multipart metadata.") from error

    try:
        with tempfile.NamedTemporaryFile(
            prefix="rugby-analysis-clip-",
            suffix=".mp4",
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)
            size = 0
            while chunk := await video.read(1024 * 1024):
                temporary.write(chunk)
                size += len(chunk)
        if size == 0:
            raise HTTPException(status_code=422, detail="Uploaded analysis clip is empty.")
        return await asyncio.to_thread(
            service.analyze,
            request,
            video_path=str(temporary_path),
            context=metadata_payload,
            history=sanitized_history,
        )
    except AnalysisProviderError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    finally:
        await video.close()
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


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
