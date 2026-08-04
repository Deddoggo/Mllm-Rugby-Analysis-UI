"""Model-independent video-language analysis boundary."""

from abc import ABC, abstractmethod
from typing import Any


class VLMInterface(ABC):
    """Contract implemented by mock and future real VLM adapters."""

    name: str

    @abstractmethod
    def analyze(
        self,
        clip_path: str,
        question: str,
        context: dict[str, Any],
    ) -> str:
        """Analyze one prepared clip with its structured rugby context."""
        raise NotImplementedError
