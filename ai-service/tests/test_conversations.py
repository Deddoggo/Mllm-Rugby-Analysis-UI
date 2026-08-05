"""Clip-scoped conversation persistence and multi-turn orchestration tests."""

from pathlib import Path

from app.schemas.analysis import AnalysisQueryRequest
from app.services.analysis_service import AnalysisService
from app.services.conversation_repository import ConversationRepository
from app.vlm.interface import VLMInterface, VLMRequest


VIDEO_ID = "match_20260803_abcd1234"
EVENT_ID = "event_001"


class StubContextBuilder:
    def build(self, video_id, event_id, clip_id, question):
        return {
            "video": {"video_id": video_id},
            "event": {"id": event_id, "label": "Scrum"},
            "clip": {"clip_id": clip_id, "duration": 12.0},
            "question": question,
            "_clip_path": "clip.mp4",
        }


class CapturingVLM(VLMInterface):
    name = "qwen:qwen3.7-flash"

    def __init__(self) -> None:
        self.requests: list[VLMRequest] = []

    def analyze(self, request: VLMRequest) -> str:
        self.requests.append(request)
        return f"Answer {len(self.requests)}"


def make_request(clip_id: str, question: str) -> AnalysisQueryRequest:
    return AnalysisQueryRequest(
        video_id=VIDEO_ID,
        event_id=EVENT_ID,
        clip_id=clip_id,
        question=question,
    )


def test_create_append_and_retrieve_conversation(tmp_path: Path) -> None:
    provider = CapturingVLM()
    repository = ConversationRepository(tmp_path / "conversations")
    service = AnalysisService(
        vlm=provider,
        context_builder=StubContextBuilder(),
        conversation_repository=repository,
    )

    first = service.analyze(make_request("clip_one", "Who won this scrum?"))
    second = service.analyze(make_request("clip_one", "Why?"))
    history = service.get_conversation(VIDEO_ID, EVENT_ID, "clip_one")

    assert first.conversation_id == second.conversation_id
    assert first.turn_number == 1
    assert second.turn_number == 2
    assert second.provider_metadata.display_name == "Qwen API"
    assert second.provider_metadata.model == "qwen3.7-flash"
    assert provider.requests[0].history == []
    assert provider.requests[1].history == [
        {"role": "user", "content": "Who won this scrum?"},
        {"role": "assistant", "content": "Answer 1"},
    ]
    assert [message.content for message in history.messages] == [
        "Who won this scrum?",
        "Answer 1",
        "Why?",
        "Answer 2",
    ]
    assert (tmp_path / "conversations" / VIDEO_ID / "clip_one.json").is_file()


def test_different_clips_use_separate_conversations(tmp_path: Path) -> None:
    service = AnalysisService(
        vlm=CapturingVLM(),
        context_builder=StubContextBuilder(),
        conversation_repository=ConversationRepository(tmp_path / "conversations"),
    )
    first = service.analyze(make_request("clip_one", "First clip question"))
    second = service.analyze(make_request("clip_two", "Second clip question"))

    assert first.conversation_id != second.conversation_id
    assert service.get_conversation(VIDEO_ID, EVENT_ID, "clip_one").messages[0].content == (
        "First clip question"
    )
    assert service.get_conversation(VIDEO_ID, EVENT_ID, "clip_two").messages[0].content == (
        "Second clip question"
    )
