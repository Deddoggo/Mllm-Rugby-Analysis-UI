"""Stable detector boundary internal to AI-service inference."""

from typing import Protocol, TypedDict


class EventProposal(TypedDict):
    id: str
    video_id: str
    label: str
    start: float
    end: float
    confidence: float
    detected_start: float
    detected_end: float
    adjusted: bool


class EventDetector(Protocol):
    """Contract that the future real V-JEPA2 adapter must implement."""

    name: str

    def detect_events(
        self,
        video_path: str,
        video_id: str,
        duration: float,
    ) -> list[EventProposal]:
        """Return normalized temporal proposals for one processed video."""
        ...
