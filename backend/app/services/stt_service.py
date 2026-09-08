"""Speech-to-text service: Hugging Face Whisper (primary) + Groq fallback.

Primary: `InferenceClient.automatic_speech_recognition()` against
`openai/whisper-large-v3` via the `hf-inference` provider.

Fallback: Groq's OpenAI-compatible `/audio/transcriptions` endpoint
(Whisper-based), enabled automatically when `GROQ_API_KEY` is set and the
primary HF call fails. This keeps the service abstraction swappable per
project_details.md/the brief without hard-requiring Groq to be wired for
the MVP to work.
"""

from __future__ import annotations

import asyncio

import httpx
from huggingface_hub import InferenceClient
from huggingface_hub.errors import HfHubHTTPError

from app.core.config import Settings
from app.core.logging import get_logger
from app.utils.errors import (
    ConfigurationError,
    InvalidTokenError,
    RateLimitError,
    STTError,
)

logger = get_logger(__name__)

GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_STT_MODEL = "whisper-large-v3"


class STTService:
    """Transcribes audio to text, with an HF-primary / Groq-fallback design."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def _require_configured(self) -> None:
        if not self._settings.hf_configured and not self._settings.groq_api_key:
            raise ConfigurationError(
                "Speech-to-text is not configured on the server (missing "
                "Hugging Face token)."
            )

    async def transcribe(self, audio_bytes: bytes, content_type: str | None) -> str:
        """Transcribe audio bytes to text, trying HF first then Groq."""
        self._require_configured()

        if self._settings.hf_configured:
            try:
                return await self._transcribe_hf(audio_bytes)
            except Exception as exc:  # noqa: BLE001
                logger.warning("HF STT failed, attempting fallback if available: %s", exc)
                if not self._settings.groq_api_key:
                    raise self._map_hf_error(exc) from exc

        if self._settings.groq_api_key:
            return await self._transcribe_groq(audio_bytes, content_type)

        raise STTError("Speech-to-text failed. Please try again.")

    async def _transcribe_hf(self, audio_bytes: bytes) -> str:
        client = InferenceClient(
            token=self._settings.hf_token,
            provider=self._settings.hf_stt_provider,
        )

        def _run() -> str:
            result = client.automatic_speech_recognition(
                audio_bytes, model=self._settings.hf_stt_model
            )
            # huggingface_hub returns an object with a `.text` attribute
            # (or a plain string in some client versions) -- handle both.
            text = getattr(result, "text", None)
            return text if text is not None else str(result)

        return await asyncio.to_thread(_run)

    async def _transcribe_groq(
        self, audio_bytes: bytes, content_type: str | None
    ) -> str:
        headers = {"Authorization": f"Bearer {self._settings.groq_api_key}"}
        files = {
            "file": ("audio.webm", audio_bytes, content_type or "application/octet-stream"),
        }
        data = {"model": GROQ_STT_MODEL}

        try:
            async with httpx.AsyncClient(
                timeout=self._settings.request_timeout_seconds
            ) as client:
                response = await client.post(
                    GROQ_TRANSCRIPTION_URL, headers=headers, files=files, data=data
                )
            response.raise_for_status()
            payload = response.json()
            return str(payload.get("text", ""))
        except httpx.HTTPStatusError as exc:
            logger.exception("Groq STT fallback failed")
            if exc.response.status_code == 401:
                raise InvalidTokenError("The Groq API key is invalid.") from exc
            if exc.response.status_code == 429:
                raise RateLimitError(
                    "The speech-to-text service's usage allowance has been "
                    "reached. Please try again later."
                ) from exc
            raise STTError("Speech-to-text failed. Please try again.") from exc
        except httpx.HTTPError as exc:
            logger.exception("Groq STT fallback network error")
            raise STTError("Speech-to-text failed. Please try again.") from exc

    @staticmethod
    def _map_hf_error(exc: Exception) -> Exception:
        if isinstance(exc, HfHubHTTPError):
            status_code = exc.response.status_code if exc.response is not None else None
            if status_code == 401:
                return InvalidTokenError(
                    "The Hugging Face token is invalid or unauthorized."
                )
            if status_code == 429:
                return RateLimitError(
                    "The speech-to-text service's free usage allowance has "
                    "been reached. Please try again later."
                )
        return STTError("Speech-to-text failed. Please try again.")
