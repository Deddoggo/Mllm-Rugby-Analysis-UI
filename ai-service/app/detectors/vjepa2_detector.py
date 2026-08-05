"""Placeholder for the future GPU-backed V-JEPA2 detector."""


VJEPA2_UNAVAILABLE_MESSAGE = (
    "V-JEPA2 detector requires GPU deployment and is currently unavailable."
)


class VJEPA2DetectorUnavailable:
    """Document the future provider slot without loading model dependencies."""

    def __init__(self) -> None:
        raise RuntimeError(VJEPA2_UNAVAILABLE_MESSAGE)
