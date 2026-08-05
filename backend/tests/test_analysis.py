"""Backend-to-AI-service client and analysis gateway tests."""

import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import HTTPException

from app.api.analysis import (
    analyze_clip,
    delete_clip_conversation,
    get_clip_conversation,
)
from app.schemas.analysis import (
    AIServiceAnalysisRequest,
    AnalysisGatewayResponse,
    AnalysisQuestionRequest,
    ConversationHistoryResponse,
    ConversationDeleteResponse,
    ProviderMetadata,
)
from app.services.ai_client import (
    AIServiceClient,
    AIServiceProtocolError,
    AIServiceUnavailableError,
    DEFAULT_AI_SERVICE_TIMEOUT_SECONDS,
)


VIDEO_ID = "match_20260803_abcd1234"
EVENT_ID = "event_001"
CLIP_ID = "clip_event_001_abcd1234"


class FakeMetadataService:
    def __init__(self, exists: bool = True) -> None:
        self.exists = exists

    def get_by_id(self, video_id: str):
        return SimpleNamespace(video_id=video_id) if self.exists else None


class FakeClipRepository:
    def __init__(self, exists: bool = True) -> None:
        self.exists = exists

    def get_clip(self, video_id: str, clip_id: str):
        if not self.exists:
            return None
        return SimpleNamespace(
            video_id=video_id,
            event_id=EVENT_ID,
            clip_id=clip_id,
        )


class AIServiceClientTests(unittest.TestCase):
    def test_default_timeout_outlasts_qwen_provider_timeout(self) -> None:
        client = AIServiceClient(base_url="http://ai.test")
        self.assertEqual(client.timeout_seconds, DEFAULT_AI_SERVICE_TIMEOUT_SECONDS)
        self.assertGreater(client.timeout_seconds, 120)

    def test_mock_ai_service_response_is_typed(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.url.path, "/analysis/query")
            self.assertIn(b'"event_id":"event_001"', request.content)
            return httpx.Response(200, json={
                "answer": "This is a scrum phase.",
                "provider": "mock-rugby-vlm",
                "provider_metadata": {
                    "id": "mock",
                    "display_name": "Mock VLM",
                    "model": None,
                },
                "conversation_id": "conv_001",
                "turn_number": 1,
                "confidence": "limited",
                "metadata": {"context_used": {"event": {"label": "Scrum"}}},
            })

        client = AIServiceClient(
            base_url="http://ai.test",
            transport=httpx.MockTransport(handler),
        )
        response = asyncio.run(client.analyze(AIServiceAnalysisRequest(
            video_id=VIDEO_ID,
            event_id=EVENT_ID,
            clip_id=CLIP_ID,
            question="Explain this scrum phase",
        )))
        self.assertEqual(response.provider, "mock-rugby-vlm")
        self.assertEqual(response.conversation_id, "conv_001")
        self.assertEqual(response.confidence, "limited")

    def test_schema_mismatch_is_reported_as_protocol_error(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={
                "answer": "Valid answer with incomplete envelope.",
                "provider": "qwen:qwen3.7-flash",
                "turn_number": "not-an-integer",
            })

        client = AIServiceClient(
            base_url="http://ai.test",
            transport=httpx.MockTransport(handler),
        )
        with self.assertLogs("app.services.ai_client", level="ERROR") as logs:
            with self.assertRaises(AIServiceProtocolError):
                asyncio.run(client.analyze(AIServiceAnalysisRequest(
                    video_id=VIDEO_ID,
                    event_id=EVENT_ID,
                    clip_id=CLIP_ID,
                    question="Explain this scrum phase",
                )))
        self.assertIn("response validation failed", "\n".join(logs.output))

    def test_retrieves_conversation_history(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(
                request.url.path,
                f"/analysis/conversations/{VIDEO_ID}/{EVENT_ID}/{CLIP_ID}",
            )
            return httpx.Response(200, json={
                "conversation_id": "conv_001",
                "video_id": VIDEO_ID,
                "event_id": EVENT_ID,
                "clip_id": CLIP_ID,
                "messages": [{
                    "role": "user",
                    "content": "Who won?",
                    "created_at": "2026-08-05T12:00:00Z",
                }],
            })

        client = AIServiceClient(
            base_url="http://ai.test",
            transport=httpx.MockTransport(handler),
        )
        response = asyncio.run(client.get_conversation(VIDEO_ID, EVENT_ID, CLIP_ID))
        self.assertEqual(response.conversation_id, "conv_001")
        self.assertEqual(response.messages[0].content, "Who won?")

    def test_deletes_conversation_through_ai_service(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.method, "DELETE")
            self.assertEqual(
                request.url.path,
                f"/analysis/conversations/{VIDEO_ID}/{EVENT_ID}/{CLIP_ID}",
            )
            return httpx.Response(200, json={"deleted": True})

        client = AIServiceClient(
            base_url="http://ai.test",
            transport=httpx.MockTransport(handler),
        )
        response = asyncio.run(client.delete_conversation(VIDEO_ID, EVENT_ID, CLIP_ID))
        self.assertTrue(response.deleted)


class AnalysisGatewayTests(unittest.TestCase):
    def test_forwards_complete_multi_turn_qwen_response(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.url.path, "/analysis/query")
            return httpx.Response(200, json={
                "answer": "France retained possession after the reset.",
                "provider": "qwen:qwen3.7-flash",
                "provider_metadata": {
                    "id": "qwen",
                    "display_name": "Qwen API",
                    "model": "qwen3.7-flash",
                },
                "conversation_id": "conv_qwen_001",
                "turn_number": 2,
                "confidence": "limited",
                "metadata": {
                    "context_used": {
                        "video": {"video_id": VIDEO_ID},
                        "event": {"label": "Scrum"},
                        "clip": {"clip_id": CLIP_ID},
                    },
                },
            })

        client = AIServiceClient(
            base_url="http://ai.test",
            transport=httpx.MockTransport(handler),
        )
        with (
            patch("app.api.analysis.metadata_service", FakeMetadataService()),
            patch("app.api.analysis.clip_repository", FakeClipRepository()),
            patch("app.api.analysis.ai_client", client),
        ):
            response = asyncio.run(analyze_clip(
                VIDEO_ID,
                CLIP_ID,
                AnalysisQuestionRequest(question="Why did they retain possession?"),
            ))

        self.assertEqual(response.conversation_id, "conv_qwen_001")
        self.assertEqual(response.turn_number, 2)
        self.assertEqual(response.provider, "qwen:qwen3.7-flash")
        self.assertEqual(response.provider_metadata.display_name, "Qwen API")
        self.assertEqual(response.provider_metadata.model, "qwen3.7-flash")

    def test_forwards_authoritative_clip_metadata(self) -> None:
        expected = AnalysisGatewayResponse(
            answer="This is a scrum phase.",
            provider="mock-rugby-vlm",
            provider_metadata=ProviderMetadata(id="mock", display_name="Mock VLM"),
            conversation_id="conv_001",
            turn_number=1,
            confidence="limited",
            metadata={},
        )
        client = SimpleNamespace(analyze=AsyncMock(return_value=expected))
        with (
            patch("app.api.analysis.metadata_service", FakeMetadataService()),
            patch("app.api.analysis.clip_repository", FakeClipRepository()),
            patch("app.api.analysis.ai_client", client),
        ):
            response = asyncio.run(analyze_clip(
                VIDEO_ID,
                CLIP_ID,
                AnalysisQuestionRequest(question=" Explain this scrum phase "),
            ))

        self.assertEqual(response, expected)
        forwarded = client.analyze.await_args.args[0]
        self.assertEqual(forwarded.event_id, EVENT_ID)
        self.assertEqual(forwarded.question, "Explain this scrum phase")
        self.assertEqual(forwarded.mode, "detailed")

    def test_forwards_concise_answer_mode(self) -> None:
        expected = AnalysisGatewayResponse(
            answer="Short answer.",
            provider="mock-rugby-vlm",
            confidence="limited",
            metadata={},
        )
        client = SimpleNamespace(analyze=AsyncMock(return_value=expected))
        with (
            patch("app.api.analysis.metadata_service", FakeMetadataService()),
            patch("app.api.analysis.clip_repository", FakeClipRepository()),
            patch("app.api.analysis.ai_client", client),
        ):
            asyncio.run(analyze_clip(
                VIDEO_ID,
                CLIP_ID,
                AnalysisQuestionRequest(question="Summarize", mode="concise"),
            ))
        self.assertEqual(client.analyze.await_args.args[0].mode, "concise")

    def test_delete_conversation_is_idempotently_forwarded(self) -> None:
        response = ConversationDeleteResponse(deleted=True)
        client = SimpleNamespace(delete_conversation=AsyncMock(return_value=response))
        with (
            patch("app.api.analysis.metadata_service", FakeMetadataService()),
            patch("app.api.analysis.clip_repository", FakeClipRepository()),
            patch("app.api.analysis.ai_client", client),
        ):
            first = asyncio.run(delete_clip_conversation(VIDEO_ID, CLIP_ID))
            second = asyncio.run(delete_clip_conversation(VIDEO_ID, CLIP_ID))
        self.assertTrue(first.deleted)
        self.assertTrue(second.deleted)
        self.assertEqual(client.delete_conversation.await_count, 2)
        client.delete_conversation.assert_awaited_with(VIDEO_ID, EVENT_ID, CLIP_ID)

    def test_get_conversation_forwards_authoritative_event(self) -> None:
        expected = ConversationHistoryResponse(
            conversation_id="conv_001",
            video_id=VIDEO_ID,
            event_id=EVENT_ID,
            clip_id=CLIP_ID,
            messages=[],
        )
        client = SimpleNamespace(get_conversation=AsyncMock(return_value=expected))
        with (
            patch("app.api.analysis.metadata_service", FakeMetadataService()),
            patch("app.api.analysis.clip_repository", FakeClipRepository()),
            patch("app.api.analysis.ai_client", client),
        ):
            response = asyncio.run(get_clip_conversation(VIDEO_ID, CLIP_ID))
        self.assertEqual(response, expected)
        client.get_conversation.assert_awaited_once_with(VIDEO_ID, EVENT_ID, CLIP_ID)

    def test_invalid_clip_returns_404_without_calling_ai_service(self) -> None:
        client = SimpleNamespace(analyze=AsyncMock())
        with (
            patch("app.api.analysis.metadata_service", FakeMetadataService()),
            patch("app.api.analysis.clip_repository", FakeClipRepository(False)),
            patch("app.api.analysis.ai_client", client),
        ):
            with self.assertRaises(HTTPException) as caught:
                asyncio.run(analyze_clip(
                    VIDEO_ID,
                    CLIP_ID,
                    AnalysisQuestionRequest(question="What happened?"),
                ))
        self.assertEqual(caught.exception.status_code, 404)
        client.analyze.assert_not_awaited()

    def test_unavailable_ai_service_returns_503(self) -> None:
        client = SimpleNamespace(analyze=AsyncMock(
            side_effect=AIServiceUnavailableError("AI service is unavailable.")
        ))
        with (
            patch("app.api.analysis.metadata_service", FakeMetadataService()),
            patch("app.api.analysis.clip_repository", FakeClipRepository()),
            patch("app.api.analysis.ai_client", client),
        ):
            with self.assertRaises(HTTPException) as caught:
                asyncio.run(analyze_clip(
                    VIDEO_ID,
                    CLIP_ID,
                    AnalysisQuestionRequest(question="What happened?"),
                ))
        self.assertEqual(caught.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
