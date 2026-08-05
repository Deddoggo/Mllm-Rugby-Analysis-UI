"""Qwen OpenAI-compatible video-language provider adapter."""

from pathlib import Path
from typing import Any

from app.vlm.api_vlm import APIVLM, RUGBY_ANALYST_INSTRUCTION, VLMAPIError
from app.vlm.interface import VLMRequest


MAX_INLINE_VIDEO_BYTES = 7 * 1024 * 1024


class QwenVLM(APIVLM):
    """Format video input for Qwen's OpenAI-compatible chat API."""

    provider = "qwen"

    def build_payload(self, request: VLMRequest) -> dict[str, Any]:
        path = Path(request.video_path)
        if path.is_file() and path.stat().st_size > MAX_INLINE_VIDEO_BYTES:
            raise VLMAPIError(
                "Qwen inline video input is limited to clips of 7 MB or less. "
                "A larger clip must be supplied through a public URL."
            )
        return {
            "model": self.model,
            "messages": [
                {"role": "system", "content": RUGBY_ANALYST_INSTRUCTION},
                *request.history,
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "video_url",
                            "video_url": {"url": self.video_data_url(request.video_path)},
                        },
                        {"type": "text", "text": self.build_user_prompt(request)},
                    ],
                },
            ],
            "temperature": 0.2,
        }
