"""Custom exception hierarchy + FastAPI exception handlers.

All application-raised errors funnel through `AppError` subclasses, each
carrying an HTTP status code, a stable `error_code`, and a human-readable
`detail` message that is SAFE to show directly to the end user. Raw
exceptions from third-party SDKs (huggingface_hub, httpx, etc.) are always
caught inside the services layer and re-raised as one of these -- they must
never bubble up to the client with their original message, which could leak
upstream API details.

The `unhandled_exception_handler` is a last-resort catch-all that guarantees
we never leak a stack trace to the client even for truly unexpected errors.
"""

from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_logger

logger = get_logger(__name__)


class AppError(Exception):
    """Base class for all application errors with a clean client-facing message."""

    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    error_code: str = "internal_error"

    def __init__(self, detail: str | None = None) -> None:
        self.detail = detail or self.__class__.__doc__ or "An error occurred."
        super().__init__(self.detail)


class ConfigurationError(AppError):
    """The server is missing required configuration for this feature."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    error_code = "configuration_error"


class InvalidTokenError(AppError):
    """The configured Hugging Face token was rejected as invalid."""

    status_code = status.HTTP_502_BAD_GATEWAY
    error_code = "invalid_hf_token"


class ProviderUnavailableError(AppError):
    """The requested model/provider is currently unavailable."""

    status_code = status.HTTP_502_BAD_GATEWAY
    error_code = "provider_unavailable"


class RateLimitError(AppError):
    """The Hugging Face rate limit or free-credit allowance has been exhausted."""

    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    error_code = "rate_limited"


class UpstreamTimeoutError(AppError):
    """The upstream AI service took too long to respond."""

    status_code = status.HTTP_504_GATEWAY_TIMEOUT
    error_code = "upstream_timeout"


class UpstreamServiceError(AppError):
    """The upstream AI service returned an unexpected error."""

    status_code = status.HTTP_502_BAD_GATEWAY
    error_code = "upstream_error"


class STTError(AppError):
    """Speech-to-text transcription failed."""

    status_code = status.HTTP_502_BAD_GATEWAY
    error_code = "stt_failed"


class TTSError(AppError):
    """Text-to-speech synthesis failed or is unavailable."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    error_code = "tts_unavailable"


class InvalidAudioError(AppError):
    """The uploaded audio file is missing, empty, or in an unsupported format."""

    status_code = status.HTTP_400_BAD_REQUEST
    error_code = "invalid_audio"


class InvalidRequestError(AppError):
    """The request body was malformed or failed validation."""

    status_code = status.HTTP_400_BAD_REQUEST
    error_code = "invalid_request"


def _error_body(detail: str, error_code: str) -> dict[str, str]:
    return {"detail": detail, "error_code": error_code}


def register_exception_handlers(app: FastAPI) -> None:
    """Attach all exception handlers to the FastAPI app."""

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        logger.warning(
            "AppError on %s %s: [%s] %s",
            request.method,
            request.url.path,
            exc.error_code,
            exc.detail,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(exc.detail, exc.error_code),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        logger.info(
            "Validation error on %s %s: %s", request.method, request.url.path, exc
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_error_body(
                "Your request could not be processed -- please check the "
                "input and try again.",
                "invalid_request",
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        # Preserve FastAPI's own HTTPExceptions (e.g. 404s) but normalize the body.
        detail = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(detail, "http_error"),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception(
            "Unhandled exception on %s %s", request.method, request.url.path
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_error_body(
                "Something went wrong on our end. Please try again.",
                "internal_error",
            ),
        )
