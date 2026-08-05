"""Orchestrate context assembly and the configured VLM adapter."""

from app.context.builder import ContextBuilder
from app.schemas.analysis import (
    AnalysisContextUsed,
    AnalysisMetadata,
    AnalysisQueryRequest,
    AnalysisQueryResponse,
    ConversationHistoryResponse,
    ProviderMetadata,
)
from app.services.conversation_repository import ConversationRepository
from app.vlm.interface import VLMInterface, VLMRequest


class AnalysisProviderError(RuntimeError):
    """Raised when the configured VLM provider fails internally."""


class AnalysisService:
    """Keep API handling independent from the selected VLM implementation."""

    def __init__(
        self,
        vlm: VLMInterface,
        context_builder: ContextBuilder | None = None,
        conversation_repository: ConversationRepository | None = None,
    ) -> None:
        self.context_builder = context_builder or ContextBuilder()
        self.conversation_repository = conversation_repository or ConversationRepository()
        self.vlm = vlm

    def analyze(self, request: AnalysisQueryRequest) -> AnalysisQueryResponse:
        context = self.context_builder.build(
            request.video_id,
            request.event_id,
            request.clip_id,
            request.question,
        )
        clip_path = str(context.pop("_clip_path", ""))
        conversation = self.conversation_repository.get(
            request.video_id,
            request.event_id,
            request.clip_id,
        )
        history = [
            {"role": message.role, "content": message.content}
            for message in conversation.messages
        ] if conversation else []
        try:
            answer = self.vlm.analyze(VLMRequest(
                video_path=clip_path,
                question=request.question,
                context=context,
                history=history,
            ))
        except Exception as error:
            raise AnalysisProviderError("VLM provider failed.") from error
        provider_metadata = describe_provider(self.vlm.name)
        conversation = self.conversation_repository.append_turn(
            video_id=request.video_id,
            event_id=request.event_id,
            clip_id=request.clip_id,
            question=request.question,
            answer=answer,
            provider=self.vlm.name,
            provider_metadata=provider_metadata,
        )
        return AnalysisQueryResponse(
            answer=answer,
            provider=self.vlm.name,
            provider_metadata=provider_metadata,
            conversation_id=conversation.conversation_id,
            turn_number=sum(
                message.role == "assistant" for message in conversation.messages
            ),
            confidence="limited",
            metadata=AnalysisMetadata(
                context_used=AnalysisContextUsed(
                    video=context.get("video", {}),
                    event=context.get("event", {}),
                    clip=context.get("clip", {}),
                ),
            ),
        )

    def get_conversation(
        self,
        video_id: str,
        event_id: str,
        clip_id: str,
    ) -> ConversationHistoryResponse:
        conversation = self.conversation_repository.get(video_id, event_id, clip_id)
        if conversation is None:
            conversation = self.conversation_repository.empty(video_id, event_id, clip_id)
        return ConversationHistoryResponse.model_validate(conversation.model_dump())


def describe_provider(provider: str) -> ProviderMetadata:
    """Translate provider identity into UI metadata at the service boundary."""
    family, separator, model = provider.partition(":")
    if provider == "mock-rugby-vlm":
        return ProviderMetadata(id="mock", display_name="Mock VLM")
    display_names = {
        "qwen": "Qwen API",
        "gemma": "Gemma Local",
    }
    return ProviderMetadata(
        id=family,
        display_name=display_names.get(family, family.replace("-", " ").title()),
        model=model if separator else None,
    )
