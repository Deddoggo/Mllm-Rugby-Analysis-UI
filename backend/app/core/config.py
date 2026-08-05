"""Backend filesystem and service configuration."""

import os
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPOSITORY_ROOT / "data"
ORIGINAL_VIDEO_DIR = DATA_DIR / "videos"
PROCESSED_VIDEO_DIR = DATA_DIR / "processed"
EVENTS_DIR = DATA_DIR / "events"
CLIPS_DIR = DATA_DIR / "clips"
METADATA_DIR = DATA_DIR / "metadata"
VIDEO_METADATA_FILE = METADATA_DIR / "videos.json"
AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8100").rstrip("/")
