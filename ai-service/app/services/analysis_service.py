"""Orchestrate context assembly and the configured VLM adapter."""

from app.context.builder import ContextBuilder
from app.schemas.analysis import (
    AnalysisContextUsed,
    AnalysisMetadata,
    AnalysisQueryRequest,
    AnalysisQueryResponse,
)
from app.vlm.interface import VLMInterface


class AnalysisProviderError(RuntimeError):
    """Raised when the configured VLM provider fails internally."""


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
        try:
            answer = self.vlm.analyze(clip_path, request.question, context)
        except Exception as error:
            raise AnalysisProviderError("VLM provider failed.") from error
        return AnalysisQueryResponse(
            answer=answer,
            provider=self.vlm.name,
            confidence="limited",
            metadata=AnalysisMetadata(
                context_used=AnalysisContextUsed(
                    video=context.get("video", {}),
                    event=context.get("event", {}),
                    clip=context.get("clip", {}),
                ),
            ),
        )
