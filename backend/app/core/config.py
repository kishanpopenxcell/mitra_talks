"""Centralized application configuration.

Reads all runtime configuration from environment variables (optionally via a
local `.env` file) using pydantic-settings. Nothing here should ever be
logged verbatim if it is a secret (see `Settings.__repr__` override and
`app/core/logging.py`).

The app MUST be able to boot with no secrets configured at all -- missing
configuration is only ever a problem at the moment a given feature (LLM,
STT, TTS) is actually used, not at startup. See `Settings.hf_configured`
and `Settings.tts_configured`, which back the `/health` endpoint.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables / `.env`."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Hugging Face Inference Providers ---------------------------------
    hf_token: str | None = Field(default=None, alias="HF_TOKEN")

    hf_llm_model: str = Field(
        default="meta-llama/Llama-3.1-8B-Instruct", alias="HF_LLM_MODEL"
    )
    hf_llm_provider: str = Field(default="nscale", alias="HF_LLM_PROVIDER")

    hf_stt_model: str = Field(
        default="openai/whisper-large-v3", alias="HF_STT_MODEL"
    )
    hf_stt_provider: str = Field(default="hf-inference", alias="HF_STT_PROVIDER")

    # --- TTS (Cartesia primary, Deepgram optional fallback) ---------------
    cartesia_api_key: str | None = Field(default=None, alias="CARTESIA_API_KEY")
    cartesia_tts_model: str = Field(default="sonic-3.6", alias="CARTESIA_TTS_MODEL")
    cartesia_voice_id: str | None = Field(default=None, alias="CARTESIA_VOICE_ID")

    deepgram_api_key: str | None = Field(default=None, alias="DEEPGRAM_API_KEY")

    # --- Optional STT fallback ---------------------------------------------
    groq_api_key: str | None = Field(default=None, alias="GROQ_API_KEY")

    # --- CORS ----------------------------------------------------------------
    frontend_origin: str = Field(
        default="http://localhost:5173", alias="FRONTEND_ORIGIN"
    )

    # --- Conversation / performance controls -------------------------------
    max_conversation_messages: int = Field(
        default=20, alias="MAX_CONVERSATION_MESSAGES", ge=1
    )
    max_response_tokens: int = Field(
        default=300, alias="MAX_RESPONSE_TOKENS", ge=1
    )

    # --- Misc ----------------------------------------------------------------
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(
        default="INFO", alias="LOG_LEVEL"
    )
    request_timeout_seconds: float = Field(default=30.0, alias="REQUEST_TIMEOUT_SECONDS")

    @property
    def hf_configured(self) -> bool:
        """Whether a Hugging Face token is present (chat + STT gate)."""
        return bool(self.hf_token and self.hf_token.strip())

    @property
    def tts_configured(self) -> bool:
        """Whether at least one TTS backend (Cartesia or Deepgram) is usable."""
        return bool(
            (self.cartesia_api_key and self.cartesia_api_key.strip())
            or (self.deepgram_api_key and self.deepgram_api_key.strip())
        )

    def __repr__(self) -> str:  # pragma: no cover - defensive redaction
        return "Settings(**redacted**)"

    def __str__(self) -> str:  # pragma: no cover - defensive redaction
        return self.__repr__()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings accessor -- environment is read once per process."""
    return Settings()
