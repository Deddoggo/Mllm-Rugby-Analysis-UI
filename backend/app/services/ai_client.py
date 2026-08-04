"""Async HTTP client for the independent Rugby Intelligence AI service."""

import httpx
from pydantic import ValidationError

from app.core.config import AI_SERVICE_URL
from app.schemas.analysis import AIServiceAnalysisRequest, AnalysisGatewayResponse


class AIServiceUnavailableError(ConnectionError):
    """Raised when the AI service cannot be reached."""


class AIServiceProtocolError(RuntimeError):
    """Raised when the AI service rejects a valid request or returns invalid data."""


class AIServiceClient:
    """Call the AI service without exposing HTTP details to API routes."""

    def __init__(
        self,
        base_url: str = AI_SERVICE_URL,
        timeout_seconds: float = 30.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.transport = transport

    async def analyze(self, request: AIServiceAnalysisRequest) -> AnalysisGatewayResponse:
        try:
            async with httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout_seconds,
                transport=self.transport,
            ) as client:
                response = await client.post(
                    "/analysis/query",
                    json=request.model_dump(),
                )
        except httpx.RequestError as error:
            raise AIServiceUnavailableError("AI service is unavailable.") from error

        if response.status_code >= 500:
            raise AIServiceProtocolError("AI service provider failed.")
        if not response.is_success:
            raise AIServiceProtocolError(
                f"AI service rejected the analysis request ({response.status_code})."
            )
        try:
            return AnalysisGatewayResponse.model_validate(response.json())
        except (ValueError, ValidationError) as error:
            raise AIServiceProtocolError("AI service returned an invalid response.") from error
