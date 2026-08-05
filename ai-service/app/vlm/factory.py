"""Environment-driven VLM provider construction."""

from app.core.config import Settings
from app.vlm.interface import VLMInterface
from app.vlm.mock_vlm import MockVLM
from app.vlm.qwen_vlm import QwenVLM


def create_vlm(settings: Settings) -> VLMInterface:
    """Create the configured adapter without leaking provider details upstream."""
    if settings.vlm_provider == "mock":
        return MockVLM()
    if settings.vlm_provider == "qwen":
        return QwenVLM(
            api_key=settings.qwen_api_key,
            model=settings.qwen_model,
            base_url=settings.qwen_base_url,
            timeout=settings.vlm_request_timeout,
        )
    raise ValueError(
        f"Unsupported VLM_PROVIDER '{settings.vlm_provider}'. "
        "Expected mock or qwen."
    )
