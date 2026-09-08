"""FastAPI application entrypoint.

Creates the app, configures CORS, mounts routers, and registers exception
handlers. Keeps startup resilient to missing configuration -- the app must
boot cleanly even with no `.env`/secrets present (see `app/core/config.py`);
missing config only surfaces as a clean error at the moment a feature is
actually used, and as `false` flags from `GET /health`.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import chat, health, voice
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.utils.errors import register_exception_handlers

settings = get_settings()
configure_logging(settings.log_level)
logger = get_logger(__name__)

app = FastAPI(
    title="Mood-Based AI Voice Companion API",
    description=(
        "Backend API for a personal AI voice companion whose conversational "
        "tone adapts to a user-selected mood. Provides mood-aware streaming "
        "chat, speech-to-text, and text-to-speech endpoints. No "
        "authentication, no database, no persistent memory -- conversation "
        "history is supplied by the client on each request."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(health.router)
app.include_router(chat.router)
app.include_router(voice.router)


@app.on_event("startup")
async def on_startup() -> None:
    logger.info(
        "Starting up. hf_configured=%s tts_configured=%s frontend_origin=%s",
        settings.hf_configured,
        settings.tts_configured,
        settings.frontend_origin,
    )
    if not settings.hf_configured:
        logger.warning(
            "HF_TOKEN is not set -- chat and speech-to-text endpoints will "
            "return a clean 'not configured' error until it is provided."
        )
    if not settings.tts_configured:
        logger.warning(
            "No TTS backend is configured (CARTESIA_API_KEY/DEEPGRAM_API_KEY) "
            "-- text-to-speech endpoints will report unavailable until one is provided."
        )
