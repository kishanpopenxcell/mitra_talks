"""Text-to-speech service: Cartesia (primary) + Deepgram Aura-2 (fallback hook).

Why Cartesia instead of Hugging Face for TTS
---------------------------------------------
project_details.md asks for Hugging Face wherever practical, and that is
exactly what's used for the LLM and STT. TTS is the one deliberate,
documented deviation: as of implementation time, Hugging Face's Inference
Providers marketplace does not have a working/reliable TTS routing path
(no provider consistently serves a text-to-speech task through the
`InferenceClient.text_to_speech()` route the way `hf-inference` reliably
serves ASR, or `nscale` serves chat). Rather than depend on a flaky/
unavailable route, Cartesia's REST API is used directly -- it has a
generous free tier, low latency, and a simple `POST /tts/bytes` endpoint
that returns browser-playable WAV bytes directly. This keeps the MVP's
"no paid API required" constraint intact while actually working.

The service is still built as a swappable abstraction: `TTSService.synthesize()`
tries Cartesia and is structured so a Deepgram Aura-2 fallback (or any other
REST TTS backend) can be added by implementing `_synthesize_deepgram()` and
wiring it into the same try/fallback pattern used in `stt_service.py`. Only
Cartesia is fully wired for this MVP, per the brief.

If TTS is unavailable/misconfigured/fails, `synthesize()` raises `TTSError`.
Callers (routes) must translate that into the documented "TTS unavailable"
signal (503 JSON for `/api/voice/speak`, `tts_available: false` for
`/api/voice/converse`) rather than ever letting it crash a request that
otherwise succeeded (e.g. a chat reply should still be returned even if
speech synthesis fails).
"""

from __future__ import annotations

import struct

import httpx

from app.core.config import Settings
from app.core.logging import get_logger
from app.utils.errors import ConfigurationError, RateLimitError, TTSError

logger = get_logger(__name__)

CARTESIA_TTS_URL = "https://api.cartesia.ai/tts/bytes"
CARTESIA_API_VERSION = "2026-08-14"

# Cartesia synthesizes as a stream, so the WAV header it returns carries the
# 0xFFFFFFFF "unknown length" sentinel in both the RIFF chunk size and the
# data chunk size instead of real byte counts. Tools that scan the stream
# (ffmpeg) cope, but `new Audio(...)` in the browser trusts the header and
# either refuses to play the clip or reports a ~13-hour duration -- which
# surfaced as silent playback with `tts_available: true`. We rewrite the two
# size fields with the real values before returning the bytes.
WAV_UNKNOWN_SIZE = 0xFFFFFFFF
WAV_MIN_HEADER_BYTES = 44

# A reasonable default Cartesia voice if none is configured. Users should
# still set CARTESIA_VOICE_ID explicitly for a voice they've chosen from
# https://play.cartesia.ai/voices.
DEFAULT_CARTESIA_VOICE_ID = "a0e99841-438c-4a64-b679-ae501e7d6091"


def _fix_wav_header(data: bytes) -> bytes:
    """Replace placeholder RIFF/data sizes with the real byte counts.

    Returns `data` untouched if it isn't a RIFF/WAVE payload or has no `data`
    chunk -- a non-WAV container (e.g. if the output format is switched to
    mp3) must pass through unmodified.
    """
    if (
        len(data) < WAV_MIN_HEADER_BYTES
        or data[:4] != b"RIFF"
        or data[8:12] != b"WAVE"
    ):
        return data

    # Walk the chunk list rather than assuming `data` sits at a fixed offset --
    # a LIST/fact chunk before it would shift the position.
    offset = 12
    data_offset: int | None = None
    while offset + 8 <= len(data):
        chunk_id = data[offset : offset + 4]
        chunk_size = struct.unpack_from("<I", data, offset + 4)[0]
        if chunk_id == b"data":
            data_offset = offset
            break
        if chunk_size == WAV_UNKNOWN_SIZE:
            # An unsized chunk before `data` means we can't keep walking.
            break
        # Chunks are word-aligned: an odd size is followed by a pad byte.
        offset += 8 + chunk_size + (chunk_size % 2)

    if data_offset is None:
        logger.warning("TTS returned a WAV with no locatable data chunk; passing through")
        return data

    patched = bytearray(data)
    struct.pack_into("<I", patched, 4, len(data) - 8)
    struct.pack_into("<I", patched, data_offset + 4, len(data) - data_offset - 8)
    return bytes(patched)


class TTSService:
    """Synthesizes speech audio from text, Cartesia-primary with a swappable fallback."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def _require_configured(self) -> None:
        if not self._settings.tts_configured:
            raise ConfigurationError(
                "Text-to-speech is not configured on the server."
            )

    async def synthesize(self, text: str) -> bytes:
        """Return raw WAV audio bytes for the given text.

        Raises `TTSError` (or a subclass) if synthesis is unavailable or fails.
        """
        self._require_configured()

        if self._settings.cartesia_api_key:
            try:
                return await self._synthesize_cartesia(text)
            except TTSError:
                if not self._settings.deepgram_api_key:
                    raise
                logger.warning("Cartesia TTS failed, attempting Deepgram fallback")

        if self._settings.deepgram_api_key:
            return await self._synthesize_deepgram(text)

        raise TTSError("Text-to-speech is unavailable.")

    async def _synthesize_cartesia(self, text: str) -> bytes:
        headers = {
            "Cartesia-Version": CARTESIA_API_VERSION,
            "Authorization": f"Bearer {self._settings.cartesia_api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model_id": self._settings.cartesia_tts_model,
            "transcript": text,
            "voice": {
                "mode": "id",
                "id": self._settings.cartesia_voice_id or DEFAULT_CARTESIA_VOICE_ID,
            },
            "output_format": {
                "container": "wav",
                "encoding": "pcm_s16le",
                "sample_rate": 44100,
            },
        }

        try:
            async with httpx.AsyncClient(
                timeout=self._settings.request_timeout_seconds
            ) as client:
                response = await client.post(
                    CARTESIA_TTS_URL, headers=headers, json=body
                )
            response.raise_for_status()
            return _fix_wav_header(response.content)
        except httpx.HTTPStatusError as exc:
            logger.exception("Cartesia TTS request failed")
            if exc.response.status_code == 401:
                raise TTSError("Text-to-speech authentication failed.") from exc
            if exc.response.status_code == 429:
                raise RateLimitError(
                    "The text-to-speech service's usage allowance has been "
                    "reached. Please try again later."
                ) from exc
            raise TTSError("Text-to-speech failed. Please try again.") from exc
        except httpx.HTTPError as exc:
            logger.exception("Cartesia TTS network error")
            raise TTSError("Text-to-speech failed. Please try again.") from exc

    async def _synthesize_deepgram(self, text: str) -> bytes:
        """Deepgram Aura-2 fallback hook.

        Not fully wired for this MVP (Cartesia is the primary and only
        required backend), but the abstraction is in place so it can be
        completed by implementing the Aura-2 REST call here without
        touching any route code.
        """
        raise TTSError("Deepgram TTS fallback is not yet implemented.")
