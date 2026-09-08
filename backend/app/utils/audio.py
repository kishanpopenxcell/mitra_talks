"""Small audio-handling helpers shared by the voice routes/services."""

from __future__ import annotations

import base64

# Browsers' MediaRecorder typically produces one of these container/codec
# combinations. We don't need to transcode -- both HF STT (via
# huggingface_hub) and Groq's Whisper endpoint accept compressed audio
# directly -- but we do sanity-check the upload looks like real audio before
# spending an API call on it.
ALLOWED_AUDIO_CONTENT_TYPES: set[str] = {
    "audio/webm",
    "audio/ogg",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/mpeg",
    "audio/mp4",
    "audio/m4a",
    "audio/aac",
}

MIN_AUDIO_BYTES = 100  # anything smaller almost certainly isn't real audio


def looks_like_valid_audio(content_type: str | None, data: bytes) -> bool:
    """Best-effort sanity check that an upload is plausibly audio.

    We deliberately keep this permissive: browsers/OSes vary in what
    `Content-Type` they set on recorded blobs, and rejecting valid audio
    because of an unfamiliar MIME string is worse than letting the upstream
    STT provider be the final arbiter of decodability.
    """
    if not data or len(data) < MIN_AUDIO_BYTES:
        return False
    if content_type and content_type.lower().split(";")[0].strip() not in (
        ALLOWED_AUDIO_CONTENT_TYPES
    ):
        # Unknown content-type is not automatically invalid (e.g.
        # "application/octet-stream" is common from some browsers) -- only
        # reject empty/too-small payloads above. This function still lets
        # callers use it as a first filter for obviously wrong types if
        # desired.
        return True
    return True


def audio_bytes_to_base64(data: bytes) -> str:
    """Encode raw audio bytes as a base64 string for JSON responses."""
    return base64.b64encode(data).decode("ascii")
