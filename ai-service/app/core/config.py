"""Environment-driven AI service configuration."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


load_dotenv()


@dataclass(frozen=True)
class Settings:
    """Runtime settings shared by the API and context adapters."""

    host: str
    port: int
    repository_root: Path
    data_dir: Path
    events_dir: Path
    clips_dir: Path
    conversations_dir: Path
    video_metadata_file: Path
    event_detector_provider: str
    vlm_provider: str
    qwen_api_key: str
    qwen_model: str
    qwen_base_url: str
    vlm_request_timeout: float


def load_settings() -> Settings:
    repository_root = Path(__file__).resolve().parents[3]
    data_dir = Path(os.getenv("RUGBY_DATA_DIR", repository_root / "data")).resolve()
    try:
        port = int(os.getenv("AI_SERVICE_PORT", "9000"))
    except ValueError as error:
        raise RuntimeError("AI_SERVICE_PORT must be an integer.") from error
    if not 1 <= port <= 65535:
        raise RuntimeError("AI_SERVICE_PORT must be between 1 and 65535.")
    try:
        vlm_request_timeout = float(os.getenv("VLM_REQUEST_TIMEOUT", "120"))
    except ValueError as error:
        raise RuntimeError("VLM_REQUEST_TIMEOUT must be numeric.") from error
    if vlm_request_timeout <= 0:
        raise RuntimeError("VLM_REQUEST_TIMEOUT must be greater than zero.")
    event_detector_provider = (
        os.getenv("EVENT_DETECTOR_PROVIDER", "mock").strip().lower() or "mock"
    )
    if event_detector_provider != "mock":
        raise RuntimeError(
            "EVENT_DETECTOR_PROVIDER currently supports only 'mock'."
        )
    return Settings(
        host=os.getenv("AI_SERVICE_HOST", "127.0.0.1"),
        port=port,
        repository_root=repository_root,
        data_dir=data_dir,
        events_dir=data_dir / "events",
        clips_dir=data_dir / "clips",
        conversations_dir=data_dir / "conversations",
        video_metadata_file=data_dir / "metadata" / "videos.json",
        event_detector_provider=event_detector_provider,
        vlm_provider=os.getenv("VLM_PROVIDER", "mock").strip().lower() or "mock",
        qwen_api_key=os.getenv("QWEN_API_KEY", "").strip(),
        qwen_model=os.getenv("QWEN_MODEL", "qwen3.7-flash").strip(),
        qwen_base_url=os.getenv(
            "QWEN_BASE_URL",
            "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        ).rstrip("/"),
        vlm_request_timeout=vlm_request_timeout,
    )


settings = load_settings()
