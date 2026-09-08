"""Speech-to-text service: Hugging Face Whisper (primary) + Groq fallback.

Primary: a direct POST of the raw audio bytes to the Hugging Face inference
router (`openai/whisper-large-v3` via the `hf-inference` provider).

We deliberately do NOT use `InferenceClient.automatic_speech_recognition()`
here. When handed raw `bytes`, `huggingface_hub` (0.36.x) builds its request
body via `_open_as_mime_bytes()`, which returns `MimeBytes(content)` with no
mime type for the `bytes` branch. The router then receives a literal
`Content-Type: None` and rejects every request with:

    Bad request: Content type "None" not supported.

The client offers no hook to override that header, so the fix is to make the
HTTP call ourselves and forward the `Content-Type` the browser already gave
us on the upload. This also drops a thread-pool hop, since we were only using
`asyncio.to_thread` to wrap the SDK's blocking call.

Fallback: Groq's OpenAI-compatible `/audio/transcriptions` endpoint
(Whisper-based), enabled automatically when `GROQ_API_KEY` is set and the
primary HF call fails. This keeps the service abstraction swappable per
project_details.md/the brief without hard-requiring Groq to be wired for
the MVP to work.
"""

from __future__ import annotations

import httpx

from app.core.config import Settings
from app.core.logging import get_logger
from app.utils.errors import (
    ConfigurationError,
    InvalidTokenError,
    RateLimitError,
    STTError,
)

logger = get_logger(__name__)

HF_ROUTER_ASR_URL = "https://router.huggingface.co/{provider}/models/{model}"

# The router matches on a bare MIME type; `audio/webm;codecs=opus` (what
# MediaRecorder reports) is rejected, so the codec parameter is stripped.
DEFAULT_AUDIO_CONTENT_TYPE = "audio/webm"

GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_STT_MODEL = "whisper-large-v3"


def _normalize_content_type(content_type: str | None) -> str:
    """Reduce a browser upload's content type to the bare MIME type."""
    if not content_type:
        return DEFAULT_AUDIO_CONTENT_TYPE
    bare = content_type.split(";")[0].strip().lower()
    return bare or DEFAULT_AUDIO_CONTENT_TYPE


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
                return await self._transcribe_hf(audio_bytes, content_type)
            except Exception as exc:  # noqa: BLE001
                logger.warning("HF STT failed, attempting fallback if available: %s", exc)
                if not self._settings.groq_api_key:
                    raise self._map_hf_error(exc) from exc

        if self._settings.groq_api_key:
            return await self._transcribe_groq(audio_bytes, content_type)

        raise STTError("Speech-to-text failed. Please try again.")

    async def _transcribe_hf(self, audio_bytes: bytes, content_type: str | None) -> str:
        url = HF_ROUTER_ASR_URL.format(
            provider=self._settings.hf_stt_provider,
            model=self._settings.hf_stt_model,
        )
        headers = {
            "Authorization": f"Bearer {self._settings.hf_token}",
            "Content-Type": _normalize_content_type(content_type),
        }

        async with httpx.AsyncClient(
            timeout=self._settings.request_timeout_seconds
        ) as client:
            response = await client.post(url, content=audio_bytes, headers=headers)
        response.raise_for_status()

        payload = response.json()
        # The ASR route returns {"text": ...}; some providers wrap the same
        # shape in a single-element list.
        if isinstance(payload, list) and payload:
            payload = payload[0]
        if isinstance(payload, dict):
            return str(payload.get("text", ""))
        return str(payload)

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
        # The HF path now issues its own httpx request, so the status-bearing
        # exception is `httpx.HTTPStatusError` rather than `HfHubHTTPError`.
        status_code: int | None = None
        if isinstance(exc, httpx.HTTPStatusError):
            status_code = exc.response.status_code

        if status_code in (401, 403):
            return InvalidTokenError(
                "The Hugging Face token is invalid or unauthorized."
            )
        if status_code == 429:
            return RateLimitError(
                "The speech-to-text service's free usage allowance has "
                "been reached. Please try again later."
            )
        return STTError("Speech-to-text failed. Please try again.")
