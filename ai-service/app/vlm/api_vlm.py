"""Shared HTTP mechanics for external OpenAI-compatible VLM providers."""

import base64
import json
import mimetypes
from abc import abstractmethod
from pathlib import Path
from typing import Any

import httpx

from app.vlm.interface import VLMInterface, VLMRequest


RUGBY_ANALYST_INSTRUCTION = (
    "You are a rugby video analyst. Analyze the provided video clip. "
    "Use only visible evidence. Use the supplied metadata as context, not as proof. "
    "If information is uncertain or not visible, explicitly state that uncertainty."
)


class VLMConfigurationError(RuntimeError):
    """Raised when an explicitly selected external provider is incomplete."""


class VLMAPIError(RuntimeError):
    """Raised when an external provider cannot return a usable answer."""


class APIVLM(VLMInterface):
    """Base adapter for providers exposing an OpenAI-compatible chat endpoint."""

    provider: str

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        base_url: str,
        timeout: float = 120.0,
        client: httpx.Client | None = None,
    ) -> None:
        self.api_key = api_key.strip()
        self.model = model.strip()
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.client = client
        self.name = f"{self.provider}:{self.model}" if self.model else self.provider

    def analyze(self, request: VLMRequest) -> str:
        self._validate_configuration()
        payload = self.build_payload(request)
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        try:
            if self.client is not None:
                response = self.client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=self.timeout,
                )
            else:
                response = httpx.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=self.timeout,
                )
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise VLMAPIError(f"{self.provider} VLM request failed.") from error
        return self._extract_answer(response)

    @abstractmethod
    def build_payload(self, request: VLMRequest) -> dict[str, Any]:
        """Convert the neutral request into the provider's wire format."""
        raise NotImplementedError

    def build_user_prompt(self, request: VLMRequest) -> str:
        public_context = {
            key: value
            for key, value in request.context.items()
            if not key.startswith("_") and key != "question"
        }
        return (
            "Structured rugby context:\n"
            f"{json.dumps(public_context, ensure_ascii=False, sort_keys=True)}\n\n"
            f"Analyst question:\n{request.question}"
        )

    @staticmethod
    def video_data_url(video_path: str) -> str:
        path = Path(video_path)
        if not path.is_file():
            raise VLMAPIError("Prepared analysis clip is unavailable.")
        try:
            encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        except OSError as error:
            raise VLMAPIError("Prepared analysis clip could not be read.") from error
        mime_type = mimetypes.guess_type(path.name)[0] or "video/mp4"
        return f"data:{mime_type};base64,{encoded}"

    def _validate_configuration(self) -> None:
        if not self.api_key:
            raise VLMConfigurationError(
                f"{self.provider.upper()}_API_KEY is required when "
                f"VLM_PROVIDER={self.provider}."
            )
        if not self.model:
            raise VLMConfigurationError(
                f"{self.provider.upper()}_MODEL is required when "
                f"VLM_PROVIDER={self.provider}."
            )
        if not self.base_url:
            raise VLMConfigurationError(f"{self.provider} base URL is required.")

    @staticmethod
    def _extract_answer(response: httpx.Response) -> str:
        try:
            payload = response.json()
            answer = payload["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as error:
            raise VLMAPIError("VLM provider returned an invalid response.") from error
        if not isinstance(answer, str) or not answer.strip():
            raise VLMAPIError("VLM provider returned an empty answer.")
        return answer.strip()
