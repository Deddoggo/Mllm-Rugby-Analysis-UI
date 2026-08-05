"""Clip identity, repository, extraction, API, and streaming tests."""

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException

from app.api.clips import (
    create_clip,
    create_clip_preview,
    delete_clip_preview,
    get_clip,
    list_clips,
    stream_clip,
    stream_clip_preview,
)
from app.api.videos import stream_video
from app.schemas.clip import ClipCreateRequest, ClipRecord
from app.schemas.clip_preview import ClipPreviewRequest
from app.schemas.event import VideoEvent
from app.schemas.video import VideoMetadata
from app.services.clip_extraction import (
    ClipExtractionError,
    ClipExtractionService,
    ClipVideoNotReadyError,
    EXTRACTION_PROFILE,
    InvalidClipBoundariesError,
)
from app.services.clip_repository import ClipRepository
from app.services.event_repository import EventRepository


VIDEO_ID = "match_20260803_abcd1234"


class FakeMetadataService:
    def __init__(self, metadata: VideoMetadata | None) -> None:
        self.metadata = metadata

    def get_by_id(self, video_id: str) -> VideoMetadata | None:
        return self.metadata if self.metadata and self.metadata.video_id == video_id else None


def sample_event(start: float = 42, end: float = 55) -> VideoEvent:
    return VideoEvent(
        id="event_001",
        video_id=VIDEO_ID,
        label="Scrum",
        start=start,
        end=end,
        confidence=0.92,
        detected_start=42,
        detected_end=55,
        adjusted=start != 42 or end != 55,
    )


def sample_record(start: float = 42, end: float = 55) -> ClipRecord:
    clip_id = ClipExtractionService.make_clip_id(
        VIDEO_ID, "event_001", start, end, EXTRACTION_PROFILE
    )
    return ClipRecord(
        clip_id=clip_id,
        video_id=VIDEO_ID,
        event_id="event_001",
        event_label="Scrum",
        start=start,
        end=end,
        duration=round(end - start, 3),
        path=f"data/clips/{VIDEO_ID}/{clip_id}.mp4",
        stream_url=f"/videos/{VIDEO_ID}/clips/{clip_id}/stream",
        extraction_profile=EXTRACTION_PROFILE,
        source_video_path="data/processed/source.mp4",
        created_at=datetime.now(timezone.utc),
    )


class ClipTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.data_dir = self.root / "data"
        self.source = self.data_dir / "processed" / "source.mp4"
        self.source.parent.mkdir(parents=True)
        self.source.write_bytes(b"source")
        self.events = EventRepository(self.data_dir / "events")
        self.events.save_events(VIDEO_ID, [sample_event()], "mock-vjepa2")
        self.clips = ClipRepository(self.data_dir / "clips")
        self.metadata = VideoMetadata(
            video_id=VIDEO_ID,
            filename="match.mp4",
            sha256="a" * 64,
            duration=180,
            size=6,
            original_path="data/videos/original.mp4",
            processed_path="data/processed/source.mp4",
            status="processed",
            created_at=datetime.now(timezone.utc),
        )
        self.service = ClipExtractionService(
            metadata_service=FakeMetadataService(self.metadata),
            event_repository=self.events,
            clip_repository=self.clips,
            repository_root=self.root,
            data_dir=self.data_dir,
            preview_dir=self.data_dir / "previews",
        )

        async def extract(_source, output, _start, _duration):
            output.write_bytes(b"generated-clip")

        self.extract = AsyncMock(side_effect=extract)
        self.service._extract_with_fallback = self.extract
        self.service._validate_output = lambda _path, _duration: None

    def tearDown(self) -> None:
        self.temporary.cleanup()


class ClipRepositoryTests(ClipTestCase):
    def test_event_detection_persistence_does_not_create_clips(self) -> None:
        self.assertFalse((self.data_dir / "clips").exists())

    def test_atomic_write_and_malformed_empty_recovery(self) -> None:
        record = sample_record()
        media = self.clips.clip_directory(VIDEO_ID) / f"{record.clip_id}.mp4"
        media.parent.mkdir(parents=True)
        media.write_bytes(b"clip")
        self.clips.save_clip(VIDEO_ID, record)
        self.assertEqual(self.clips.get_clip(VIDEO_ID, record.clip_id), record)
        self.assertEqual(list(media.parent.glob("*.tmp")), [])
        metadata_file = media.parent / "clips.json"
        metadata_file.write_text("", encoding="utf-8")
        self.assertEqual(self.clips.list_clips(VIDEO_ID), [])
        metadata_file.write_text("{broken", encoding="utf-8")
        self.assertEqual(self.clips.list_clips(VIDEO_ID), [])

    def test_stale_metadata_is_not_reused(self) -> None:
        record = sample_record()
        directory = self.clips.clip_directory(VIDEO_ID)
        directory.mkdir(parents=True)
        (directory / "clips.json").write_text(
            json.dumps([record.model_dump(mode="json")]), encoding="utf-8"
        )
        self.assertIsNone(self.clips.get_clip(VIDEO_ID, record.clip_id))
        self.assertIsNone(self.clips.find_cached_clip(
            VIDEO_ID, record.event_id, record.start, record.end, EXTRACTION_PROFILE
        ))


class ClipExtractionTests(ClipTestCase):
    def test_extracts_one_event_then_reuses_cache(self) -> None:
        first, first_cached = asyncio.run(self.service.create_clip(VIDEO_ID, "event_001"))
        second, second_cached = asyncio.run(self.service.create_clip(VIDEO_ID, "event_001"))
        self.assertFalse(first_cached)
        self.assertTrue(second_cached)
        self.assertEqual(first.clip_id, second.clip_id)
        self.assertEqual(self.extract.await_count, 1)
        self.assertTrue(self.clips.resolve_media_path(first).is_file())
        self.assertEqual(list(self.clips.clip_directory(VIDEO_ID).glob("*.tmp.mp4")), [])

    def test_changed_boundaries_change_identity_and_force_reextracts(self) -> None:
        first, _ = asyncio.run(self.service.create_clip(VIDEO_ID, "event_001"))
        self.events.update_event(VIDEO_ID, "event_001", 40, 60)
        changed, _ = asyncio.run(self.service.create_clip(VIDEO_ID, "event_001"))
        asyncio.run(self.service.create_clip(VIDEO_ID, "event_001", force=True))
        self.assertNotEqual(first.clip_id, changed.clip_id)
        self.assertEqual(self.extract.await_count, 3)

    def test_missing_cached_file_causes_reextraction(self) -> None:
        record, _ = asyncio.run(self.service.create_clip(VIDEO_ID, "event_001"))
        self.clips.resolve_media_path(record).unlink()
        asyncio.run(self.service.create_clip(VIDEO_ID, "event_001"))
        self.assertEqual(self.extract.await_count, 2)

    def test_rejects_short_long_and_out_of_bounds_events(self) -> None:
        short = sample_event(10, 11.9)
        with self.assertRaises(InvalidClipBoundariesError):
            self.service._validated_boundaries(short, 180)
        long_event = SimpleNamespace(start=10, end=70.001)
        with self.assertRaises(InvalidClipBoundariesError):
            self.service._validated_boundaries(long_event, 180)
        beyond = sample_event(170, 180)
        with self.assertRaises(InvalidClipBoundariesError):
            self.service._validated_boundaries(beyond, 175)

    def test_video_not_ready_and_missing_event(self) -> None:
        self.metadata.status = "processing"
        with self.assertRaises(ClipVideoNotReadyError):
            asyncio.run(self.service.create_clip(VIDEO_ID, "event_001"))
        self.metadata.status = "processed"
        with self.assertRaises(LookupError):
            asyncio.run(self.service.create_clip(VIDEO_ID, "event_missing"))

    def test_failure_removes_temporary_and_final_files(self) -> None:
        self.service._extract_with_fallback = AsyncMock(
            side_effect=ClipExtractionError("encoder failed")
        )
        with self.assertRaises(ClipExtractionError):
            asyncio.run(self.service.create_clip(VIDEO_ID, "event_001"))
        directory = self.clips.clip_directory(VIDEO_ID)
        self.assertEqual(list(directory.glob("*.mp4")), [])

    def test_preview_is_temporary_and_never_enters_persistent_cache(self) -> None:
        first = asyncio.run(self.service.create_preview(VIDEO_ID, "event_001"))
        second = asyncio.run(self.service.create_preview(VIDEO_ID, "event_001"))

        self.assertNotEqual(first.preview_id, second.preview_id)
        self.assertTrue(first.temporary)
        self.assertEqual(self.clips.list_clips(VIDEO_ID), [])
        self.assertFalse((self.data_dir / "clips" / VIDEO_ID / "clips.json").exists())
        self.assertFalse((self.data_dir / "clips").exists())
        self.assertEqual(len(list((self.data_dir / "previews").glob("*.mp4"))), 2)

        self.assertTrue(self.service.delete_preview(VIDEO_ID, first.preview_id))
        self.assertIsNone(self.service.get_preview(VIDEO_ID, first.preview_id))
        self.assertEqual(len(list((self.data_dir / "previews").glob("*.mp4"))), 1)

    def test_preview_failure_removes_all_temporary_output(self) -> None:
        self.service._extract_with_fallback = AsyncMock(
            side_effect=ClipExtractionError("encoder failed")
        )
        with self.assertRaises(ClipExtractionError):
            asyncio.run(self.service.create_preview(VIDEO_ID, "event_001"))
        self.assertEqual(list((self.data_dir / "previews").glob("*")), [])

    def test_output_validation_contract(self) -> None:
        output = self.root / "clip.mp4"
        output.write_bytes(b"clip")
        details = {
            "streams": [
                {"codec_type": "video", "codec_name": "h264"},
                {"codec_type": "audio", "codec_name": "aac"},
            ],
            "format": {"duration": "13.1", "format_name": "mov,mp4,m4a"},
        }
        with patch("app.services.clip_extraction.run_ffprobe", return_value=details):
            ClipExtractionService._validate_output(output, 13)
        details["format"]["duration"] = "15"
        with patch("app.services.clip_extraction.run_ffprobe", return_value=details):
            with self.assertRaises(ClipExtractionError):
                ClipExtractionService._validate_output(output, 13)


class ClipApiTests(ClipTestCase):
    def test_create_list_get_and_range_stream(self) -> None:
        with patch("app.api.clips.clip_extraction_service", self.service):
            created = asyncio.run(create_clip(VIDEO_ID, ClipCreateRequest(event_id="event_001")))
            self.assertFalse(created.cached)
            self.assertFalse(hasattr(created, "path"))
            listed = asyncio.run(list_clips(VIDEO_ID))
            self.assertEqual(len(listed.clips), 1)
            fetched = asyncio.run(get_clip(VIDEO_ID, created.clip_id))
            self.assertEqual(fetched.clip_id, created.clip_id)
            response = asyncio.run(stream_clip(VIDEO_ID, created.clip_id))
            ranged = asyncio.run(self._send_file_response(response, b"bytes=0-3"))
            self.assertEqual(ranged["status"], 206)
            self.assertEqual(ranged["headers"][b"content-range"], b"bytes 0-3/14")
            self.assertEqual(ranged["headers"][b"content-length"], b"4")
            self.assertEqual(ranged["headers"][b"accept-ranges"], b"bytes")
            invalid_response = asyncio.run(stream_clip(VIDEO_ID, created.clip_id))
            invalid = asyncio.run(self._send_file_response(invalid_response, b"bytes=100-120"))
            self.assertEqual(invalid["status"], 416)

    def test_request_uses_event_id_without_boundaries(self) -> None:
        request = ClipCreateRequest.model_validate({"event_id": "event_001"})
        self.assertEqual(request.event_id, "event_001")
        self.assertFalse(hasattr(request, "start"))

    def test_preview_streams_then_is_cleaned_without_repository_write(self) -> None:
        with patch("app.api.clips.clip_extraction_service", self.service):
            preview = asyncio.run(create_clip_preview(
                VIDEO_ID,
                ClipPreviewRequest(event_id="event_001"),
            ))
            self.assertTrue(preview.temporary)
            self.assertEqual(self.clips.list_clips(VIDEO_ID), [])
            response = asyncio.run(stream_clip_preview(VIDEO_ID, preview.preview_id))
            ranged = asyncio.run(self._send_file_response(response, b"bytes=0-3"))
            self.assertEqual(ranged["status"], 206)
            self.assertEqual(ranged["headers"][b"content-range"], b"bytes 0-3/14")
            deleted = asyncio.run(delete_clip_preview(VIDEO_ID, preview.preview_id))
            self.assertEqual(deleted.status_code, 204)
            with self.assertRaises(HTTPException) as missing:
                asyncio.run(stream_clip_preview(VIDEO_ID, preview.preview_id))
            self.assertEqual(missing.exception.status_code, 404)

    def test_missing_video_and_not_ready_map_to_expected_statuses(self) -> None:
        missing = ClipExtractionService(
            metadata_service=FakeMetadataService(None),
            event_repository=self.events,
            clip_repository=self.clips,
            repository_root=self.root,
            data_dir=self.data_dir,
            preview_dir=self.data_dir / "missing-previews",
        )
        with patch("app.api.clips.clip_extraction_service", missing):
            with self.assertRaises(HTTPException) as missing_error:
                asyncio.run(create_clip(VIDEO_ID, ClipCreateRequest(event_id="event_001")))
        self.assertEqual(missing_error.exception.status_code, 404)

        self.metadata.status = "processing"
        with patch("app.api.clips.clip_extraction_service", self.service):
            with self.assertRaises(HTTPException) as not_ready_error:
                asyncio.run(create_clip(VIDEO_ID, ClipCreateRequest(event_id="event_001")))
        self.assertEqual(not_ready_error.exception.status_code, 409)

    def test_main_video_stream_still_supports_ranges(self) -> None:
        with (
            patch("app.api.videos.metadata_service", FakeMetadataService(self.metadata)),
            patch("app.api.videos.resolve_data_path", return_value=str(self.source)),
        ):
            response = asyncio.run(stream_video(VIDEO_ID))
        ranged = asyncio.run(self._send_file_response(response, b"bytes=1-3"))
        self.assertEqual(ranged["status"], 206)
        self.assertEqual(ranged["headers"][b"content-range"], b"bytes 1-3/6")

    @staticmethod
    async def _send_file_response(response, range_header: bytes) -> dict:
        messages: list[dict] = []

        async def receive() -> dict:
            return {"type": "http.request", "body": b"", "more_body": False}

        async def send(message: dict) -> None:
            messages.append(message)

        await response(
            {
                "type": "http",
                "http_version": "1.1",
                "method": "GET",
                "scheme": "http",
                "path": "/clip",
                "raw_path": b"/clip",
                "query_string": b"",
                "headers": [(b"range", range_header)],
            },
            receive,
            send,
        )
        start = next(message for message in messages if message["type"] == "http.response.start")
        return {"status": start["status"], "headers": dict(start["headers"])}


if __name__ == "__main__":
    unittest.main()
