"""Shared/common Pydantic schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Response body for `GET /health`."""

    status: str = Field(default="ok", description="Overall service status.")
    hf_configured: bool = Field(
        description="Whether a Hugging Face token is configured (chat + STT)."
    )
    tts_configured: bool = Field(
        description="Whether a TTS backend (Cartesia or Deepgram) is configured."
    )


class ErrorResponse(BaseModel):
    """Standard error body returned by all endpoints on failure.

    Never contains stack traces, secrets, or raw upstream (Hugging
    Face/Cartesia/Deepgram/Groq) internals -- only a clean, human-readable
    message safe to show directly in the UI.
    """

    detail: str = Field(description="Human-readable error message.")
    error_code: str = Field(
        description="Stable machine-readable error identifier for the frontend."
    )
