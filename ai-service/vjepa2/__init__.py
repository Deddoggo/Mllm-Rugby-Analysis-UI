"""Detector contracts and the temporary deterministic V-JEPA2 substitute."""

from vjepa2.contracts import EventDetector, EventProposal
from vjepa2.mock_detector import MockVJEPA2Detector

__all__ = ["EventDetector", "EventProposal", "MockVJEPA2Detector"]
