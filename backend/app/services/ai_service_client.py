"""HTTP boundary for AI-service event detection."""

import logging
from pathlib import Path

import httpx
from pydantic import ValidationError

from app.core.config import AI_SERVICE_URL
from app.schemas.event import AIEventDetectionResponse


LOGGER = logging.getLogger(__name__)


class AIServiceUnavailableError(ConnectionError):
    """Raised when the AI-service cannot be reached."""


class AIServiceTimeoutError(TimeoutError):
    """Raised when detector inference exceeds the gateway timeout."""


class AIServiceResponseError(RuntimeError):
    """Raised when the detector endpoint returns an invalid response."""


class AIServiceDetectorUnavailableError(AIServiceResponseError):
    """Raised when a requested detector is not deployed by the AI service."""


class EventDetectionAIClient:
    """Call AI-owned detector APIs without importing model code."""

    def __init__(
        self,
        base_url: str = AI_SERVICE_URL,
        timeout_seconds: float = 120.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.transport = transport

    async def detect_events(
        self,
        video_path: str,
        video_id: str,
        detector: str = "mock",
        duration: float | None = None,
    ) -> AIEventDetectionResponse:
        try:
            with open(video_path, "rb") as video_file:
                async with httpx.AsyncClient(
                    base_url=self.base_url,
                    timeout=self.timeout_seconds,
                    transport=self.transport,
                ) as client:
                    response = await client.post(
                        "/analysis/events/detect",
                        data={
                            "video_id": video_id,
                            "detector": detector,
                            "duration": str(duration if duration is not None else 0),
                        },
                        files={
                            "video": (
                                Path(video_path).name,
                                video_file,
                                "video/mp4",
                            ),
                        },
                    )
        except OSError as error:
            LOGGER.exception("Video upload source is unavailable for video_id=%s", video_id)
            raise AIServiceResponseError("Processed video file is unavailable.") from error
        except httpx.TimeoutException as error:
            LOGGER.exception("AI event detection timed out for video_id=%s", video_id)
            raise AIServiceTimeoutError("AI event detection timed out.") from error
        except httpx.RequestError as error:
            LOGGER.exception("AI event detection is unavailable for video_id=%s", video_id)
            raise AIServiceUnavailableError("AI service is unavailable.") from error

        if not response.is_success:
            LOGGER.error(
                "AI event detection failed: video_id=%s status=%s body=%s",
                video_id,
                response.status_code,
                response.text[:2_000],
            )
            detail = None
            try:
                payload = response.json()
                if isinstance(payload, dict) and isinstance(payload.get("detail"), str):
                    detail = payload["detail"]
            except ValueError:
                pass
            if response.status_code == 503 and detail:
                raise AIServiceDetectorUnavailableError(detail)
            raise AIServiceResponseError(
                detail or f"AI event detection failed ({response.status_code})."
            )
        try:
            return AIEventDetectionResponse.model_validate(response.json())
        except (ValueError, ValidationError) as error:
            LOGGER.exception(
                "AI event detection returned invalid JSON: video_id=%s body=%s",
                video_id,
                response.text[:2_000],
            )
            raise AIServiceResponseError(
                "AI service returned invalid event proposals."
            ) from error
