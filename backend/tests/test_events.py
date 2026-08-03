"""Event repository, detector, orchestration, and endpoint tests."""

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from pydantic import ValidationError

from app.api.events import detect_events, get_events, update_event_boundaries
from app.schemas.event import EventBoundaryUpdateRequest, VideoEvent
from app.schemas.video import VideoMetadata
from app.services.event_detection import EventDetectionService
from app.services.event_repository import EventNotFoundError, EventRepository
from vjepa2.mock_detector import MockVJEPA2Detector


VIDEO_ID = "match_20260803_abcd1234"


class FakeMetadataService:
    def __init__(self, metadata: VideoMetadata) -> None:
        self.metadata = metadata

    def get_by_id(self, video_id: str) -> VideoMetadata | None:
        return self.metadata if video_id == self.metadata.video_id else None


class CountingDetector(MockVJEPA2Detector):
    def __init__(self) -> None:
        self.calls = 0

    def detect_events(self, video_path: str, video_id: str, duration: float):
        self.calls += 1
        return super().detect_events(video_path, video_id, duration)


def sample_event() -> VideoEvent:
    return VideoEvent(
        id="event_001",
        video_id=VIDEO_ID,
        label="Scrum",
        start=42,
        end=55,
        confidence=0.92,
        detected_start=42,
        detected_end=55,
        adjusted=False,
    )


class EventRepositoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = TemporaryDirectory()
        self.events_dir = Path(self.temporary.name)
        self.repository = EventRepository(self.events_dir)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_get_before_and_after_detection_and_atomic_write(self) -> None:
        self.assertIsNone(self.repository.get_events(VIDEO_ID))
        stored = self.repository.save_events(VIDEO_ID, [sample_event()], "mock-vjepa2")
        self.assertEqual(stored.status, "ready")
        event_file = self.events_dir / f"{VIDEO_ID}.json"
        self.assertEqual(json.loads(event_file.read_text(encoding="utf-8"))["video_id"], VIDEO_ID)
        self.assertEqual(list(self.events_dir.glob("*.tmp")), [])
        self.assertEqual(self.repository.get_events(VIDEO_ID).events[0].label, "Scrum")

    def test_valid_patch_preserves_detected_boundaries(self) -> None:
        self.repository.save_events(VIDEO_ID, [sample_event()], "mock-vjepa2")
        updated = self.repository.update_event(VIDEO_ID, "event_001", 40.5, 58)
        self.assertEqual((updated.start, updated.end), (40.5, 58))
        self.assertEqual((updated.detected_start, updated.detected_end), (42, 55))
        self.assertTrue(updated.adjusted)

    def test_patch_rejects_duration_over_sixty_seconds(self) -> None:
        self.repository.save_events(VIDEO_ID, [sample_event()], "mock-vjepa2")
        with self.assertRaises(ValidationError):
            self.repository.update_event(VIDEO_ID, "event_001", 10, 71)

    def test_patch_rejects_missing_event(self) -> None:
        self.repository.save_events(VIDEO_ID, [sample_event()], "mock-vjepa2")
        with self.assertRaises(EventNotFoundError):
            self.repository.update_event(VIDEO_ID, "event_missing", 10, 20)

    def test_empty_and_malformed_json_recover_as_not_detected(self) -> None:
        event_file = self.events_dir / f"{VIDEO_ID}.json"
        event_file.write_text("", encoding="utf-8")
        self.assertIsNone(self.repository.get_events(VIDEO_ID))
        event_file.write_text("{not-json", encoding="utf-8")
        self.assertIsNone(self.repository.get_events(VIDEO_ID))
        recovered = self.repository.save_events(VIDEO_ID, [sample_event()], "mock-vjepa2")
        self.assertEqual(recovered.events[0].id, "event_001")


class DetectorAndServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = TemporaryDirectory()
        temporary_path = Path(self.temporary.name)
        self.video_path = temporary_path / "processed.mp4"
        self.video_path.write_bytes(b"test-video")
        self.repository = EventRepository(temporary_path / "events")
        self.detector = CountingDetector()
        metadata = VideoMetadata(
            video_id=VIDEO_ID,
            filename="match.mp4",
            sha256="a" * 64,
            duration=180,
            size=10,
            original_path="data/videos/original.mp4",
            processed_path="data/processed/processed.mp4",
            status="processed",
            created_at=datetime.now(timezone.utc),
        )
        self.service = EventDetectionService(
            metadata_service=FakeMetadataService(metadata),
            repository=self.repository,
            detector=self.detector,
        )
        self.service._resolve_video_path = lambda stored_path: self.video_path

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_mock_detector_is_deterministic_in_bounds_and_suppresses_background(self) -> None:
        detector = MockVJEPA2Detector()
        first = detector.detect_events(str(self.video_path), VIDEO_ID, 180)
        second = detector.detect_events(str(self.video_path), VIDEO_ID, 180)
        self.assertEqual(first, second)
        self.assertGreaterEqual(len(first), 3)
        self.assertLessEqual(len(first), 6)
        self.assertTrue(all(0 <= event["start"] < event["end"] <= 180 for event in first))
        self.assertTrue(all(10 <= event["end"] - event["start"] <= 20 for event in first))
        self.assertTrue(all(first[index]["end"] <= first[index + 1]["start"] for index in range(len(first) - 1)))
        self.assertTrue(all(event["label"] != "Background" for event in first))

    def test_detect_reuses_events_and_force_redetects(self) -> None:
        first = asyncio.run(self.service.detect_events(VIDEO_ID))
        reused = asyncio.run(self.service.detect_events(VIDEO_ID))
        forced = asyncio.run(self.service.detect_events(VIDEO_ID, force=True))
        self.assertEqual(first.events, reused.events)
        self.assertEqual(first.events, forced.events)
        self.assertEqual(self.detector.calls, 2)

    def test_endpoint_get_detect_and_patch_flow(self) -> None:
        with patch("app.api.events.event_detection_service", self.service):
            before = asyncio.run(get_events(VIDEO_ID))
            detected = asyncio.run(detect_events(VIDEO_ID, force=False))
            after = asyncio.run(get_events(VIDEO_ID))
            updated = asyncio.run(
                update_event_boundaries(
                    VIDEO_ID,
                    detected.events[0].id,
                    EventBoundaryUpdateRequest(start=1, end=12),
                )
            )
        self.assertEqual(before.status, "not_detected")
        self.assertEqual(after.status, "ready")
        self.assertTrue(updated.adjusted)


if __name__ == "__main__":
    unittest.main()
