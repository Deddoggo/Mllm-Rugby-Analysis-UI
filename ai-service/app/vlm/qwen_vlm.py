"""Qwen OpenAI-compatible video-language provider adapter."""

import logging
from pathlib import Path
from typing import Any

from app.vlm.api_vlm import APIVLM, VLMAPIError, build_system_instruction
from app.vlm.interface import VLMRequest


MAX_INLINE_VIDEO_BYTES = 7 * 1024 * 1024
LOGGER = logging.getLogger(__name__)


class QwenVLM(APIVLM):
    """Format video input for Qwen's OpenAI-compatible chat API."""

    provider = "qwen"

    def build_payload(self, request: VLMRequest) -> dict[str, Any]:
        history = self._sanitize_history(request.history)
        path = Path(request.video_path)
        video_size_bytes = path.stat().st_size if path.is_file() else 0
        has_video = not history
        if has_video and video_size_bytes > MAX_INLINE_VIDEO_BYTES:
            raise VLMAPIError(
                "Qwen inline video input is limited to clips of 7 MB or less. "
                "A larger clip must be supplied through a public URL."
            )
        LOGGER.debug(
            "Qwen request: provider=%s model=%s has_video=%s history_turns=%d "
            "video_size_mb=%.2f",
            self.provider,
            self.model,
            has_video,
            len(history),
            video_size_bytes / (1024 * 1024),
        )

        if has_video:
            current_message: dict[str, Any] = {
                "role": "user",
                "content": [
                    {
                        "type": "video_url",
                        "video_url": {"url": self.video_data_url(request.video_path)},
                    },
                    {"type": "text", "text": self.build_user_prompt(request)},
                ],
            }
        else:
            current_message = {"role": "user", "content": request.question}

        return {
            "model": self.model,
            "messages": [
                {"role": "system", "content": build_system_instruction(request)},
                *history,
                current_message,
            ],
            "temperature": 0.2,
        }

    @staticmethod
    def _sanitize_history(history: list[dict[str, str]]) -> list[dict[str, str]]:
        """Keep only provider-supported text conversation fields."""
        sanitized: list[dict[str, str]] = []
        for message in history:
            role = message.get("role")
            content = message.get("content")
            if role not in {"user", "assistant"} or not isinstance(content, str):
                continue
            sanitized.append({"role": role, "content": content})
        return sanitized
