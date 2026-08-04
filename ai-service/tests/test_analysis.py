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


def write_context(events_dir: Path, clips_dir: Path) -> None:
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
    write_context(events_dir, clips_dir)
    service = AnalysisService(
        vlm=MockVLM(),
        context_builder=ContextBuilder(events_dir, clips_dir),
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
    assert payload["model"] == "mock-vlm"
    assert payload["answer"].startswith("This is a scrum phase.")
    assert payload["context_used"]["event"]["label"] == "Scrum"
    assert payload["context_used"]["clip"]["duration"] == 13.0
    assert "path" not in payload["context_used"]["clip"]


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

    context = ContextBuilder(events_dir, clips_dir).build(
        VIDEO_ID,
        EVENT_ID,
        CLIP_ID,
        "What happened?",
    )

    assert context["event"] == {}
    assert context["clip"] == {}
    assert context["_clip_path"] == ""
    answer = MockVLM().analyze("", context["question"], context)
    assert answer.startswith("This is an unclassified phase.")
