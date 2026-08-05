"""AI-service event detection HTTP client tests."""

import asyncio
from pathlib import Path
from tempfile import TemporaryDirectory
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
    def setUp(self) -> None:
        self.temporary = TemporaryDirectory()
        self.video_path = Path(self.temporary.name) / "match.mp4"
        self.video_path.write_bytes(b"processed-video")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_success_response_is_validated(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.url.path, "/analysis/events/detect")
            self.assertTrue(request.headers["content-type"].startswith("multipart/form-data;"))
            body = request.content
            self.assertIn(b'name="video"; filename="match.mp4"', body)
            self.assertIn(b'name="video_id"', body)
            self.assertIn(VIDEO_ID.encode(), body)
            self.assertIn(b'name="detector"', body)
            self.assertIn(b"mock", body)
            self.assertIn(b'name="duration"', body)
            self.assertIn(b"180", body)
            self.assertIn(b"processed-video", body)
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
            str(self.video_path),
            VIDEO_ID,
            duration=180,
        ))
        self.assertEqual(response.events[0].label, "Scrum")

    def test_selected_detector_is_forwarded(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertIn(b"vjepa2", request.content)
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
                str(self.video_path),
                VIDEO_ID,
                "vjepa2",
                180,
            ))

    def test_timeout_is_distinct(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ReadTimeout("timed out", request=request)

        client = EventDetectionAIClient(
            base_url="http://ai.test",
            transport=httpx.MockTransport(handler),
        )
        with self.assertRaises(AIServiceTimeoutError):
            asyncio.run(client.detect_events(str(self.video_path), VIDEO_ID, duration=180))

    def test_unavailable_service_is_distinct(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("unavailable", request=request)

        client = EventDetectionAIClient(
            base_url="http://ai.test",
            transport=httpx.MockTransport(handler),
        )
        with self.assertRaises(AIServiceUnavailableError):
            asyncio.run(client.detect_events(str(self.video_path), VIDEO_ID, duration=180))

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
            asyncio.run(client.detect_events(str(self.video_path), VIDEO_ID, duration=180))


if __name__ == "__main__":
    unittest.main()
