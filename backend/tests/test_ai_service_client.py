"""AI-service event detection HTTP client tests."""

import asyncio
import json
import unittest

import httpx

from app.services.ai_service_client import (
    AIServiceResponseError,
    AIServiceTimeoutError,
    AIServiceUnavailableError,
    EventDetectionAIClient,
)


VIDEO_ID = "match_20260803_abcd1234"


class EventDetectionAIClientTests(unittest.TestCase):
    def test_success_response_is_validated(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.url.path, "/analysis/events/detect")
            self.assertEqual(json.loads(request.content), {
                "video_path": "data/processed/match.mp4",
                "video_id": VIDEO_ID,
                "detector": "mock",
            })
            return httpx.Response(200, json={"events": [{
                "id": "event_001",
                "label": "Scrum",
                "start": 42,
                "end": 55,
                "confidence": 0.92,
            }]})

        client = EventDetectionAIClient(
            base_url="http://ai.test",
            transport=httpx.MockTransport(handler),
        )
        response = asyncio.run(client.detect_events(
            "data/processed/match.mp4",
            VIDEO_ID,
        ))
        self.assertEqual(response.events[0].label, "Scrum")

    def test_selected_detector_is_forwarded(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(json.loads(request.content)["detector"], "vjepa2")
            return httpx.Response(503, json={
                "detail": "V-JEPA2 detector requires GPU deployment and is currently unavailable.",
            })

        client = EventDetectionAIClient(
            base_url="http://ai.test",
            transport=httpx.MockTransport(handler),
        )
        with self.assertRaisesRegex(
            AIServiceResponseError,
            "requires GPU deployment",
        ):
            asyncio.run(client.detect_events(
                "data/processed/match.mp4",
                VIDEO_ID,
                "vjepa2",
            ))

    def test_timeout_is_distinct(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ReadTimeout("timed out", request=request)

        client = EventDetectionAIClient(
            base_url="http://ai.test",
            transport=httpx.MockTransport(handler),
        )
        with self.assertRaises(AIServiceTimeoutError):
            asyncio.run(client.detect_events("data/processed/match.mp4", VIDEO_ID))

    def test_unavailable_service_is_distinct(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("unavailable", request=request)

        client = EventDetectionAIClient(
            base_url="http://ai.test",
            transport=httpx.MockTransport(handler),
        )
        with self.assertRaises(AIServiceUnavailableError):
            asyncio.run(client.detect_events("data/processed/match.mp4", VIDEO_ID))

    def test_invalid_response_is_rejected(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"events": [{
                "id": "event_001",
                "label": "Scrum",
                "start": 55,
                "end": 42,
                "confidence": 0.92,
            }]})

        client = EventDetectionAIClient(
            base_url="http://ai.test",
            transport=httpx.MockTransport(handler),
        )
        with self.assertRaises(AIServiceResponseError):
            asyncio.run(client.detect_events("data/processed/match.mp4", VIDEO_ID))


if __name__ == "__main__":
    unittest.main()
