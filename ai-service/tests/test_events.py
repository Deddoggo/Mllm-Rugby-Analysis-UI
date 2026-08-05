"""AI-service event detection endpoint and detector contract tests."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.api.events import get_event_detection_service
from app.main import app
from app.services.event_detection_service import AIEventDetectionService
from vjepa2.mock_detector import MockVJEPA2Detector


VIDEO_ID = "match_20260803_abcd1234"


def make_service(tmp_path: Path) -> tuple[AIEventDetectionService, Path]:
    data_dir = tmp_path / "data"
    video_path = data_dir / "processed" / "match.mp4"
    video_path.parent.mkdir(parents=True)
    video_path.write_bytes(b"mock-video")
    metadata_file = data_dir / "metadata" / "videos.json"
    metadata_file.parent.mkdir(parents=True)
    metadata_file.write_text(json.dumps([{
        "video_id": VIDEO_ID,
        "duration": 180.0,
        "processed_path": "data/processed/match.mp4",
        "status": "processed",
    }]), encoding="utf-8")
    return (
        AIEventDetectionService(
            detector=MockVJEPA2Detector(),
            data_dir=data_dir,
            video_metadata_file=metadata_file,
        ),
        video_path,
    )


def test_detector_contract_is_deterministic_and_bounded(tmp_path: Path) -> None:
    _, video_path = make_service(tmp_path)
    detector = MockVJEPA2Detector()
    first = detector.detect_events(str(video_path), VIDEO_ID, 180)
    second = detector.detect_events(str(video_path), VIDEO_ID, 180)

    assert first == second
    assert 3 <= len(first) <= 6
    assert all(0 <= event["start"] < event["end"] <= 180 for event in first)
    assert all(event["label"] != "Background" for event in first)
    assert all(
        first[index]["end"] <= first[index + 1]["start"]
        for index in range(len(first) - 1)
    )


def test_event_detection_endpoint_uses_internal_detector(tmp_path: Path) -> None:
    service, _ = make_service(tmp_path)
    app.dependency_overrides[get_event_detection_service] = lambda: service
    try:
        with TestClient(app) as client:
            response = client.post("/analysis/events/detect", json={
                "video_path": "data/processed/match.mp4",
                "video_id": VIDEO_ID,
            })
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert 3 <= len(payload["events"]) <= 6
    assert set(payload["events"][0]) == {
        "id", "label", "start", "end", "confidence",
    }
    assert all(event["label"] != "Background" for event in payload["events"])
