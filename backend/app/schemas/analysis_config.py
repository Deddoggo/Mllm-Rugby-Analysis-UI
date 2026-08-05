"""Optional analysis pipeline configuration shared by backend endpoints."""

from typing import Literal

from pydantic import BaseModel, Field


EventDetectorName = Literal["mock", "vjepa2"]


class AnalysisConfig(BaseModel):
    """Client-selected analysis options with backwards-compatible defaults."""

    event_detector: EventDetectorName = "mock"


class EventDetectionRequest(BaseModel):
    """Optional request body for selecting an event detector."""

    analysis_config: AnalysisConfig = Field(default_factory=AnalysisConfig)
