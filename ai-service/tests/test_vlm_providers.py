"""Qwen provider selection, configuration, and wire-format tests."""

import json
from dataclasses import replace
from pathlib import Path

import httpx
import pytest

from app.core.config import load_settings, settings
from app.vlm.api_vlm import (
    RUGBY_ANALYST_INSTRUCTION,
    VLMAPIError,
    VLMConfigurationError,
)
from app.vlm.factory import create_vlm
from app.vlm.interface import VLMRequest
from app.vlm.mock_vlm import MockVLM
from app.vlm.qwen_vlm import QwenVLM


def test_default_provider_falls_back_to_mock(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("VLM_PROVIDER", raising=False)
    configured = load_settings()
    assert configured.vlm_provider == "mock"
    assert isinstance(create_vlm(configured), MockVLM)


def test_process_environment_overrides_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VLM_PROVIDER", "qwen")
    monkeypatch.setenv("QWEN_MODEL", "qwen3.7-flash")
    configured = load_settings()
    assert configured.vlm_provider == "qwen"
    assert configured.qwen_model == "qwen3.7-flash"


def test_qwen_provider_selection() -> None:
    configured = replace(
        settings,
        vlm_provider="qwen",
        qwen_api_key="qwen-key",
        qwen_model="qwen3.7-plus",
    )
    provider = create_vlm(configured)
    assert isinstance(provider, QwenVLM)
    assert provider.name == "qwen:qwen3.7-plus"


def test_qwen_is_the_only_supported_external_provider() -> None:
    with pytest.raises(ValueError, match="Expected mock or qwen"):
        create_vlm(replace(settings, vlm_provider="unsupported"))


def test_qwen_requires_api_key(tmp_path: Path) -> None:
    clip = tmp_path / "clip.mp4"
    clip.write_bytes(b"video")
    provider = QwenVLM(
        api_key="",
        model="qwen3.7-plus",
        base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    )
    with pytest.raises(VLMConfigurationError, match="QWEN_API_KEY"):
        provider.analyze(VLMRequest(str(clip), "What happened?", {}))


def test_qwen_rejects_oversized_inline_video(tmp_path: Path) -> None:
    clip = tmp_path / "large-clip.mp4"
    clip.write_bytes(b"0" * (7 * 1024 * 1024 + 1))
    provider = QwenVLM(
        api_key="secret-key",
        model="qwen3.7-plus",
        base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    )
    with pytest.raises(VLMAPIError, match="7 MB or less"):
        provider.analyze(VLMRequest(str(clip), "What happened?", {}))


def test_qwen_video_payload_authentication_and_response_parsing(tmp_path: Path) -> None:
    clip = tmp_path / "clip.mp4"
    clip.write_bytes(b"mock-video-bytes")
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["authorization"] = request.headers.get("Authorization")
        captured["content_type"] = request.headers.get("Content-Type")
        captured["payload"] = json.loads(request.content)
        return httpx.Response(200, json={
            "choices": [{"message": {"content": "  Visible evidence is limited.  "}}],
        })

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        provider = QwenVLM(
            api_key="secret-key",
            model="qwen3.7-plus",
            base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
            client=client,
        )
        answer = provider.analyze(VLMRequest(
            video_path=str(clip),
            question="Explain this scrum",
            context={
                "video": {"filename": "match.mp4", "duration": 180.0},
                "event": {"label": "Scrum", "confidence": 0.91},
                "clip": {"duration": 12.5},
            },
        ))

    assert answer == "Visible evidence is limited."
    assert captured["url"] == (
        "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"
    )
    assert captured["authorization"] == "Bearer secret-key"
    assert captured["content_type"] == "application/json"
    payload = captured["payload"]
    assert isinstance(payload, dict)
    assert payload["model"] == "qwen3.7-plus"
    assert payload["messages"][0]["content"] == RUGBY_ANALYST_INSTRUCTION
    content = payload["messages"][1]["content"]
    assert [item["type"] for item in content] == ["video_url", "text"]
    video_item, text_item = content
    assert video_item["video_url"]["url"].startswith("data:video/mp4;base64,")
    assert "Explain this scrum" in text_item["text"]
    assert '"filename": "match.mp4"' in text_item["text"]
    assert '"label": "Scrum"' in text_item["text"]
    assert '"duration": 12.5' in text_item["text"]


def test_qwen_payload_includes_previous_conversation_turns(tmp_path: Path) -> None:
    clip = tmp_path / "clip.mp4"
    clip.write_bytes(b"mock-video-bytes")
    provider = QwenVLM(
        api_key="secret-key",
        model="qwen3.7-plus",
        base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    )
    payload = provider.build_payload(VLMRequest(
        video_path=str(clip),
        question="Why?",
        context={"event": {"label": "Scrum"}},
        history=[
            {"role": "user", "content": "Who won the scrum?"},
            {"role": "assistant", "content": "The blue team appears to win it."},
        ],
    ))
    assert payload["messages"][1:3] == [
        {"role": "user", "content": "Who won the scrum?"},
        {"role": "assistant", "content": "The blue team appears to win it."},
    ]
    assert payload["messages"][3]["content"][0]["type"] == "video_url"
    assert "Why?" in payload["messages"][3]["content"][1]["text"]


def test_qwen_http_error_is_wrapped(tmp_path: Path) -> None:
    clip = tmp_path / "clip.mp4"
    clip.write_bytes(b"mock-video-bytes")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": {"message": "unavailable"}})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        provider = QwenVLM(
            api_key="secret-key",
            model="qwen3.7-plus",
            base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
            client=client,
        )
        with pytest.raises(VLMAPIError, match="qwen VLM request failed"):
            provider.analyze(VLMRequest(str(clip), "What happened?", {}))


def test_qwen_malformed_response_is_rejected(tmp_path: Path) -> None:
    clip = tmp_path / "clip.mp4"
    clip.write_bytes(b"mock-video-bytes")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": []})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        provider = QwenVLM(
            api_key="secret-key",
            model="qwen3.7-plus",
            base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
            client=client,
        )
        with pytest.raises(VLMAPIError, match="invalid response"):
            provider.analyze(VLMRequest(str(clip), "What happened?", {}))
