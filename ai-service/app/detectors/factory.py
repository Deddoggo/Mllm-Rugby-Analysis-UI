"""Select event detector implementations by stable provider name."""

from vjepa2.contracts import EventDetector

from app.detectors.mock_detector import MockVJEPA2Detector
from app.detectors.vjepa2_detector import VJEPA2_UNAVAILABLE_MESSAGE


class DetectorUnavailableError(RuntimeError):
    """Raised when a known detector has not been deployed."""


def get_detector(name: str) -> EventDetector:
    """Return a configured detector without silently changing providers."""
    normalized = name.strip().lower()
    if normalized == "mock":
        return MockVJEPA2Detector()
    if normalized == "vjepa2":
        raise DetectorUnavailableError(VJEPA2_UNAVAILABLE_MESSAGE)
    raise ValueError(f"Unsupported event detector: {name}")
