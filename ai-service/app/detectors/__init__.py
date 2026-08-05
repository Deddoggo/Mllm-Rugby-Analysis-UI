"""Private detector provider selection for the AI service."""

from app.detectors.factory import DetectorUnavailableError, get_detector

__all__ = ["DetectorUnavailableError", "get_detector"]
