"""Deterministic placeholder VLM used until real inference is introduced."""

from typing import Any

from app.vlm.interface import VLMInterface


class MockVLM(VLMInterface):
    """Return stable event-aware answers without inspecting video pixels."""

    name = "mock-vlm"
    _answers = {
        "scrum": (
            "This is a scrum phase. A future model would analyze player formation, "
            "engagement, stability, and the possession outcome."
        ),
        "lineout": (
            "This is a lineout phase. A future model would analyze the throw, lifting "
            "structure, aerial contest, and resulting possession."
        ),
        "maul": (
            "This is a maul phase. A future model would analyze binding, forward momentum, "
            "ball position, and defensive organization."
        ),
        "goal kick": (
            "This is a goal-kick phase. A future model would analyze the setup, approach, "
            "contact, trajectory, and outcome."
        ),
        "background": (
            "This is an unclassified phase. A future model would inspect the clip before "
            "making a rugby-specific assessment."
        ),
    }

    def analyze(
        self,
        clip_path: str,
        question: str,
        context: dict[str, Any],
    ) -> str:
        del clip_path, question  # Real adapters will consume both values.
        event = context.get("event", {})
        label = str(event.get("label", "background")).strip().lower()
        return self._answers.get(label, self._answers["background"])
