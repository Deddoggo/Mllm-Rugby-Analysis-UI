"""Health, analysis contract, mock VLM, and context recovery tests."""

import json
import logging
import base64
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from app.api.analysis import get_analysis_service
from app.context.builder import ContextBuilder
from app.main import app
from app.core.config import settings
from app.services.analysis_service import AnalysisService
from app.services.conversation_repository import ConversationRepository
from app.vlm.interface import VLMRequest
from app.vlm.mock_vlm import MockVLM
from app.vlm.qwen_vlm import QwenVLM


VIDEO_ID = "match_20260803_abcd1234"
EVENT_ID = "event_001"
CLIP_ID = "clip_event_001_abcd1234"


def analysis_form(
    question: str,
    *,
    metadata: dict | None = None,
    history: list[dict[str, str]] | None = None,
) -> tuple[dict[str, str], dict[str, tuple[str, bytes, str]]]:
    return (
        {
            "question": question,
            "history": json.dumps(history or []),
            "metadata": json.dumps(metadata or {}),
            "conversation": json.dumps({
                "video_id": VIDEO_ID,
                "event_id": EVENT_ID,
                "clip_id": CLIP_ID,
                "mode": "detailed",
            }),
        },
        {"video": ("clip.mp4", b"uploaded-clip", "video/mp4")},
    )


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


def test_startup_logs_provider_and_model_without_api_key(caplog) -> None:
    expected_vlm = (
        f"qwen:{settings.qwen_model}"
        if settings.vlm_provider == "qwen"
        else "mock-rugby-vlm"
    )
    with caplog.at_level(logging.INFO, logger="uvicorn.error"):
        with TestClient(app):
            pass
    assert f"host={settings.host} port={settings.port}" in caplog.text
    assert "event_detector=mock-vjepa2" in caplog.text
    assert f"vlm_provider={expected_vlm}" in caplog.text
    assert "event_detection_available=True" in caplog.text
    assert "/analysis/events/detect" in caplog.text
    if settings.qwen_api_key:
        assert settings.qwen_api_key not in caplog.text


def test_analysis_query_endpoint_uses_available_context(tmp_path: Path) -> None:
    events_dir = tmp_path / "events"
    clips_dir = tmp_path / "clips"
    metadata_file = tmp_path / "metadata" / "videos.json"
    write_context(events_dir, clips_dir, metadata_file)
    service = AnalysisService(
        vlm=MockVLM(),
        context_builder=ContextBuilder(events_dir, clips_dir, metadata_file),
        conversation_repository=ConversationRepository(tmp_path / "conversations"),
    )
    app.dependency_overrides[get_analysis_service] = lambda: service
    try:
        with TestClient(app) as client:
            form, files = analysis_form(
                "Explain this scrum phase",
                metadata={
                    "video": {
                        "video_id": VIDEO_ID,
                        "filename": "match.mp4",
                        "duration": 180.0,
                    },
                    "event": {"id": EVENT_ID, "label": "Scrum"},
                    "clip": {"clip_id": CLIP_ID, "duration": 13.0},
                },
            )
            response = client.post("/analysis/query", data=form, files=files)
            history_response = client.get(
                f"/analysis/conversations/{VIDEO_ID}/{EVENT_ID}/{CLIP_ID}"
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "mock-rugby-vlm"
    assert payload["provider_metadata"]["display_name"] == "Mock VLM"
    assert payload["conversation_id"].startswith("conv_")
    assert payload["turn_number"] == 1
    assert payload["confidence"] == "limited"
    assert payload["answer"].startswith("This is a scrum phase.")
    context = payload["metadata"]["context_used"]
    assert context["video"]["filename"] == "match.mp4"
    assert context["event"]["label"] == "Scrum"
    assert context["clip"]["duration"] == 13.0
    assert "path" not in context["clip"]
    assert history_response.status_code == 200
    assert [message["role"] for message in history_response.json()["messages"]] == [
        "user",
        "assistant",
    ]


def test_mock_vlm_response_is_deterministic_by_event_type() -> None:
    vlm = MockVLM()
    context = {"event": {"label": "Lineout"}, "clip": {"duration": 10}}
    first = vlm.analyze(VLMRequest("ignored.mp4", "What happened?", context))
    second = vlm.analyze(VLMRequest("ignored.mp4", "Use different wording", context))
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
    answer = MockVLM().analyze(VLMRequest("", context["question"], context))
    assert answer.startswith("This is an unclassified phase.")


def test_invalid_request_returns_422() -> None:
    with TestClient(app) as client:
        form, files = analysis_form("")
        response = client.post("/analysis/query", data=form, files=files)
    assert response.status_code == 422


def test_provider_error_returns_500(tmp_path: Path) -> None:
    class FailingVLM(MockVLM):
        def analyze(self, request):
            raise RuntimeError("provider exploded")

    service = AnalysisService(
        vlm=FailingVLM(),
        conversation_repository=ConversationRepository(tmp_path / "conversations"),
    )
    app.dependency_overrides[get_analysis_service] = lambda: service
    try:
        with TestClient(app) as client:
            form, files = analysis_form("What happened?")
            response = client.post("/analysis/query", data=form, files=files)
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 500
    assert response.json()["detail"] == "VLM provider failed."


def test_qwen_reads_ai_service_temporary_clip(tmp_path: Path) -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        video_url = payload["messages"][1]["content"][0]["video_url"]["url"]
        captured["video_bytes"] = base64.b64decode(video_url.split(",", 1)[1])
        return httpx.Response(200, json={
            "choices": [{"message": {"content": "Visible scrum phase."}}],
        })

    with httpx.Client(transport=httpx.MockTransport(handler)) as qwen_client:
        service = AnalysisService(
            vlm=QwenVLM(
                api_key="test-key",
                model="qwen3.7-flash",
                base_url="https://qwen.test/compatible-mode/v1",
                client=qwen_client,
            ),
            conversation_repository=ConversationRepository(tmp_path / "conversations"),
        )
        app.dependency_overrides[get_analysis_service] = lambda: service
        try:
            with TestClient(app) as client:
                form, files = analysis_form(
                    "Explain this scrum",
                    metadata={"event": {"label": "Scrum"}},
                )
                files["video"] = ("clip.mp4", b"railway-clip", "video/mp4")
                response = client.post("/analysis/query", data=form, files=files)
        finally:
            app.dependency_overrides.clear()

    assert response.status_code == 200
    assert captured["video_bytes"] == b"railway-clip"
