"""Health, analysis contract, mock VLM, and context recovery tests."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.api.analysis import get_analysis_service
from app.context.builder import ContextBuilder
from app.main import app
from app.services.analysis_service import AnalysisService
from app.vlm.mock_vlm import MockVLM


VIDEO_ID = "match_20260803_abcd1234"
EVENT_ID = "event_001"
CLIP_ID = "clip_event_001_abcd1234"


def write_context(events_dir: Path, clips_dir: Path, metadata_file: Path) -> None:
    metadata_file.parent.mkdir(parents=True)
    metadata_file.write_text(json.dumps([{
        "video_id": VIDEO_ID,
        "filename": "match.mp4",
        "duration": 180.0,
        "size": 123456,
        "status": "processed",
    }]), encoding="utf-8")
    events_dir.mkdir(parents=True)
    (events_dir / f"{VIDEO_ID}.json").write_text(
        json.dumps({
            "video_id": VIDEO_ID,
            "status": "ready",
            "events": [{
                "id": EVENT_ID,
                "video_id": VIDEO_ID,
                "label": "Scrum",
                "start": 42.0,
                "end": 55.0,
                "confidence": 0.92,
                "adjusted": False,
            }],
        }),
        encoding="utf-8",
    )
    clip_dir = clips_dir / VIDEO_ID
    clip_dir.mkdir(parents=True)
    (clip_dir / "clips.json").write_text(
        json.dumps([{
            "clip_id": CLIP_ID,
            "video_id": VIDEO_ID,
            "event_id": EVENT_ID,
            "event_label": "Scrum",
            "start": 42.0,
            "end": 55.0,
            "duration": 13.0,
            "status": "ready",
            "extraction_profile": "accurate-h264-v1",
        }]),
        encoding="utf-8",
    )
    (clip_dir / f"{CLIP_ID}.mp4").write_bytes(b"mock clip")


def test_health_endpoint() -> None:
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "ai-service"}


def test_analysis_query_endpoint_uses_available_context(tmp_path: Path) -> None:
    events_dir = tmp_path / "events"
    clips_dir = tmp_path / "clips"
    metadata_file = tmp_path / "metadata" / "videos.json"
    write_context(events_dir, clips_dir, metadata_file)
    service = AnalysisService(
        vlm=MockVLM(),
        context_builder=ContextBuilder(events_dir, clips_dir, metadata_file),
    )
    app.dependency_overrides[get_analysis_service] = lambda: service
    try:
        with TestClient(app) as client:
            response = client.post("/analysis/query", json={
                "video_id": VIDEO_ID,
                "event_id": EVENT_ID,
                "clip_id": CLIP_ID,
                "question": "Explain this scrum phase",
            })
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "mock-rugby-vlm"
    assert payload["confidence"] == "limited"
    assert payload["answer"].startswith("This is a scrum phase.")
    context = payload["metadata"]["context_used"]
    assert context["video"]["filename"] == "match.mp4"
    assert context["event"]["label"] == "Scrum"
    assert context["clip"]["duration"] == 13.0
    assert "path" not in context["clip"]


def test_mock_vlm_response_is_deterministic_by_event_type() -> None:
    vlm = MockVLM()
    context = {"event": {"label": "Lineout"}, "clip": {"duration": 10}}
    first = vlm.analyze("ignored.mp4", "What happened?", context)
    second = vlm.analyze("ignored.mp4", "Use different wording", context)
    assert first == second
    assert first.startswith("This is a lineout phase.")


def test_missing_and_malformed_context_are_graceful(tmp_path: Path) -> None:
    events_dir = tmp_path / "events"
    clips_dir = tmp_path / "clips"
    events_dir.mkdir()
    clip_dir = clips_dir / VIDEO_ID
    clip_dir.mkdir(parents=True)
    (events_dir / f"{VIDEO_ID}.json").write_text("{broken", encoding="utf-8")
    (clip_dir / "clips.json").write_text("", encoding="utf-8")

    context = ContextBuilder(
        events_dir,
        clips_dir,
        tmp_path / "metadata" / "videos.json",
    ).build(
        VIDEO_ID,
        EVENT_ID,
        CLIP_ID,
        "What happened?",
    )

    assert context["event"] == {}
    assert context["clip"] == {}
    assert context["video"] == {}
    assert context["_clip_path"] == ""
    answer = MockVLM().analyze("", context["question"], context)
    assert answer.startswith("This is an unclassified phase.")


def test_invalid_request_returns_422() -> None:
    with TestClient(app) as client:
        response = client.post("/analysis/query", json={
            "video_id": VIDEO_ID,
            "event_id": EVENT_ID,
            "clip_id": CLIP_ID,
            "question": "",
        })
    assert response.status_code == 422


def test_provider_error_returns_500() -> None:
    class FailingVLM(MockVLM):
        def analyze(self, clip_path, question, context):
            raise RuntimeError("provider exploded")

    service = AnalysisService(vlm=FailingVLM())
    app.dependency_overrides[get_analysis_service] = lambda: service
    try:
        with TestClient(app) as client:
            response = client.post("/analysis/query", json={
                "video_id": VIDEO_ID,
                "event_id": EVENT_ID,
                "clip_id": CLIP_ID,
                "question": "What happened?",
            })
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 500
    assert response.json()["detail"] == "VLM provider failed."
