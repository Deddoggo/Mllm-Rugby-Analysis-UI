"""AI-service multipart event detection endpoint and detector contract tests."""

from pathlib import Path

from fastapi.testclient import TestClient

from app.api.events import get_event_detection_service
from app.main import app
from app.services.event_detection_service import AIEventDetectionService
from app.detectors.factory import DetectorUnavailableError, get_detector
from vjepa2.mock_detector import MockVJEPA2Detector


VIDEO_ID = "match_20260803_abcd1234"


def make_service(tmp_path: Path) -> tuple[AIEventDetectionService, Path]:
    video_path = tmp_path / "match.mp4"
    video_path.write_bytes(b"mock-video")
    return (
        AIEventDetectionService(detector=MockVJEPA2Detector()),
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
            response = client.post(
                "/analysis/events/detect",
                data={
                    "video_id": VIDEO_ID,
                    "detector": "mock",
                },
                files={"video": ("match.mp4", b"mock-video", "video/mp4")},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert 3 <= len(payload["events"]) <= 6
    assert set(payload["events"][0]) == {
        "id", "label", "start", "end", "confidence",
    }
    assert all(event["label"] != "Background" for event in payload["events"])


def test_detector_factory_selects_mock_and_rejects_unavailable_vjepa2() -> None:
    assert isinstance(get_detector("mock"), MockVJEPA2Detector)
    try:
        get_detector("vjepa2")
    except DetectorUnavailableError as error:
        assert str(error) == (
            "V-JEPA2 detector requires GPU deployment and is currently unavailable."
        )
    else:
        raise AssertionError("V-JEPA2 must not silently fall back to mock")


def test_event_detection_endpoint_reports_unavailable_vjepa2() -> None:
    service = AIEventDetectionService()
    app.dependency_overrides[get_event_detection_service] = lambda: service
    try:
        with TestClient(app) as client:
            response = client.post(
                "/analysis/events/detect",
                data={
                    "video_id": VIDEO_ID,
                    "detector": "vjepa2",
                    "duration": "180",
                },
                files={"video": ("match.mp4", b"mock-video", "video/mp4")},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "V-JEPA2 detector requires GPU deployment and is currently unavailable."
    )


def test_endpoint_writes_uploaded_video_to_temporary_file_then_cleans_it() -> None:
    class RecordingDetector:
        def __init__(self) -> None:
            self.path: Path | None = None
            self.contents: bytes | None = None

        def detect_events(
            self,
            video_path: str,
            video_id: str,
            duration: float,
        ) -> list[dict]:
            self.path = Path(video_path)
            assert self.path.is_file()
            self.contents = self.path.read_bytes()
            return MockVJEPA2Detector().detect_events(video_path, video_id, duration)

    detector = RecordingDetector()
    service = AIEventDetectionService(detector=detector)
    app.dependency_overrides[get_event_detection_service] = lambda: service
    try:
        with TestClient(app) as client:
            response = client.post(
                "/analysis/events/detect",
                data={
                    "video_id": VIDEO_ID,
                    "detector": "mock",
                    "duration": "180",
                },
                files={"video": ("match.mp4", b"uploaded-video", "video/mp4")},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert detector.contents == b"uploaded-video"
    assert detector.path is not None
    assert not detector.path.exists()
