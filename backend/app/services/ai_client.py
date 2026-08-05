"""Async HTTP client for the independent Rugby Intelligence AI service."""

import logging

import httpx
from pydantic import ValidationError

from app.core.config import AI_SERVICE_URL
from app.schemas.analysis import (
    AIServiceAnalysisRequest,
    AnalysisGatewayResponse,
    ConversationDeleteResponse,
    ConversationHistoryResponse,
)


LOGGER = logging.getLogger(__name__)
DEFAULT_AI_SERVICE_TIMEOUT_SECONDS = 150.0


class AIServiceUnavailableError(ConnectionError):
    """Raised when the AI service cannot be reached."""


class AIServiceProtocolError(RuntimeError):
    """Raised when the AI service rejects a valid request or returns invalid data."""


class AIServiceClient:
    """Call the AI service without exposing HTTP details to API routes."""

    def __init__(
        self,
        base_url: str = AI_SERVICE_URL,
        timeout_seconds: float = DEFAULT_AI_SERVICE_TIMEOUT_SECONDS,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.transport = transport

    async def analyze(self, request: AIServiceAnalysisRequest) -> AnalysisGatewayResponse:
        response = await self._request("POST", "/analysis/query", json=request.model_dump())
        return self._validate_response(response, AnalysisGatewayResponse)

    async def get_conversation(
        self,
        video_id: str,
        event_id: str,
        clip_id: str,
    ) -> ConversationHistoryResponse:
        response = await self._request(
            "GET",
            f"/analysis/conversations/{video_id}/{event_id}/{clip_id}",
        )
        return self._validate_response(response, ConversationHistoryResponse)

    async def delete_conversation(
        self,
        video_id: str,
        event_id: str,
        clip_id: str,
    ) -> ConversationDeleteResponse:
        response = await self._request(
            "DELETE",
            f"/analysis/conversations/{video_id}/{event_id}/{clip_id}",
        )
        return self._validate_response(response, ConversationDeleteResponse)

    async def _request(
        self,
        method: str,
        path: str,
        **kwargs,
    ) -> httpx.Response:
        try:
            async with httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout_seconds,
                transport=self.transport,
            ) as client:
                response = await client.request(method, path, **kwargs)
        except httpx.TimeoutException as error:
            LOGGER.exception(
                "AI service request timed out: method=%s path=%s timeout_seconds=%s",
                method,
                path,
                self.timeout_seconds,
            )
            raise AIServiceUnavailableError(
                "AI service timed out while processing the analysis request."
            ) from error
        except httpx.RequestError as error:
            LOGGER.exception(
                "AI service request failed: method=%s path=%s error_type=%s",
                method,
                path,
                type(error).__name__,
            )
            raise AIServiceUnavailableError("AI service is unavailable.") from error

        if response.status_code >= 500:
            LOGGER.error(
                "AI service provider failed: method=%s path=%s status=%s body=%s",
                method,
                path,
                response.status_code,
                response.text[:2_000],
            )
            raise AIServiceProtocolError("AI service provider failed.")
        if not response.is_success:
            LOGGER.error(
                "AI service rejected request: method=%s path=%s status=%s body=%s",
                method,
                path,
                response.status_code,
                response.text[:2_000],
            )
            raise AIServiceProtocolError(
                f"AI service rejected the analysis request ({response.status_code})."
            )
        return response

    @staticmethod
    def _validate_response(response: httpx.Response, schema):
        try:
            return schema.model_validate(response.json())
        except (ValueError, ValidationError) as error:
            LOGGER.exception(
                "AI service response validation failed: schema=%s status=%s body=%s",
                schema.__name__,
                response.status_code,
                response.text[:2_000],
            )
            raise AIServiceProtocolError("AI service returned an invalid response.") from error
