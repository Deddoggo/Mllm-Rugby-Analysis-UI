"""Environment-driven AI service configuration."""

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    """Runtime settings shared by the API and context adapters."""

    host: str
    port: int
    repository_root: Path
    data_dir: Path
    events_dir: Path
    clips_dir: Path


def load_settings() -> Settings:
    repository_root = Path(__file__).resolve().parents[3]
    data_dir = Path(os.getenv("RUGBY_DATA_DIR", repository_root / "data")).resolve()
    try:
        port = int(os.getenv("AI_SERVICE_PORT", "8100"))
    except ValueError as error:
        raise RuntimeError("AI_SERVICE_PORT must be an integer.") from error
    if not 1 <= port <= 65535:
        raise RuntimeError("AI_SERVICE_PORT must be between 1 and 65535.")
    return Settings(
        host=os.getenv("AI_SERVICE_HOST", "127.0.0.1"),
        port=port,
        repository_root=repository_root,
        data_dir=data_dir,
        events_dir=data_dir / "events",
        clips_dir=data_dir / "clips",
    )


settings = load_settings()
