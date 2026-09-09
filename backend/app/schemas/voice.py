"""Request/response schemas for the voice endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.mood.config import Mood
from app.schemas.chat import ChatMessage


class TranscribeResponse(BaseModel):
    """Response body for `POST /api/voice/transcribe`."""

    text: str = Field(description="The transcribed text from the uploaded audio.")


class SpeakRequest(BaseModel):
    """Request body for `POST /api/voice/speak`."""

    text: str = Field(
        description="The text to synthesize into speech.", min_length=1
    )


class ConverseFormFields(BaseModel):
    """Parsed representation of the non-file fields of `POST /api/voice/converse`.

    The actual endpoint receives these as multipart form fields (`mood` as a
    plain string, `history` as a JSON-encoded string) alongside the `audio`
    file; this model documents/validates the decoded shape.
    """

    mood: Mood = Field(description="The user's currently selected mood.")
    history: list[ChatMessage] = Field(
        default_factory=list,
        description="Prior conversation turns (JSON-encoded array in the form field).",
    )


class ConverseResponse(BaseModel):
    """Response body for `POST /api/voice/converse`.

    Audio is returned as base64 (rather than raw bytes like `/api/voice/speak`)
    because this endpoint must return a single structured JSON payload
    combining the transcript, reply text, and audio together.
    """

    transcript: str = Field(description="Transcribed text from the user's audio.")
    reply_text: str = Field(description="The AI companion's text reply.")
    audio_base64: str | None = Field(
        default=None,
        description=(
            "Base64-encoded WAV audio of the spoken reply, or null if TTS "
            "was unavailable/failed. The frontend should fall back to "
            "browser-native speech synthesis when this is null."
        ),
    )
    tts_available: bool = Field(
        description="Whether audio_base64 contains usable synthesized speech."
    )
    reaction: str | None = Field(
        default=None,
        description=(
            "The facial reaction the companion chose for this reply "
            "(surprised, confused, delighted, sheepish), or null for none."
        ),
    )
