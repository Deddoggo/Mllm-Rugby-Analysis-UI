"""Orchestrate context assembly and the configured VLM adapter."""

from app.context.builder import ContextBuilder
from app.schemas.analysis import (
    AnalysisContextUsed,
    AnalysisQueryRequest,
    AnalysisQueryResponse,
)
from app.vlm.interface import VLMInterface


class AnalysisService:
    """Keep API handling independent from the selected VLM implementation."""

    def __init__(
        self,
        vlm: VLMInterface,
        context_builder: ContextBuilder | None = None,
    ) -> None:
        self.context_builder = context_builder or ContextBuilder()
        self.vlm = vlm

    def analyze(self, request: AnalysisQueryRequest) -> AnalysisQueryResponse:
        context = self.context_builder.build(
            request.video_id,
            request.event_id,
            request.clip_id,
            request.question,
        )
        clip_path = str(context.pop("_clip_path", ""))
        answer = self.vlm.analyze(clip_path, request.question, context)
        return AnalysisQueryResponse(
            answer=answer,
            model=self.vlm.name,
            context_used=AnalysisContextUsed(
                event=context.get("event", {}),
                clip=context.get("clip", {}),
            ),
        )
