"""Health check endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import SettingsDep
from app.schemas.common import HealthResponse

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description=(
        "Returns overall service status plus whether Hugging Face (LLM/STT) "
        "and TTS (Cartesia/Deepgram) integrations are configured. Does not "
        "make any outbound API calls -- it only reports whether the "
        "required environment variables are present."
    ),
)
async def health(settings: SettingsDep) -> HealthResponse:
    return HealthResponse(
        status="ok",
        hf_configured=settings.hf_configured,
        tts_configured=settings.tts_configured,
    )
