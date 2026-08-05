"""Model-independent video-language analysis boundary."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class VLMRequest:
    """Provider-neutral representation of one clip analysis request."""

    video_path: str
    question: str
    context: dict[str, Any]
    history: list[dict[str, str]] = field(default_factory=list)


class VLMInterface(ABC):
    """Contract implemented by mock and future real VLM adapters."""

    name: str

    @abstractmethod
    def analyze(self, request: VLMRequest) -> str:
        """Analyze one prepared clip with its structured rugby context."""
        raise NotImplementedError
