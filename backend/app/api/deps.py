"""FastAPI dependency providers.

Services are constructed per-request from cached `Settings`. This keeps
routes thin (no direct instantiation of service classes) and makes it
trivial to substitute mocks/fakes if tests are added later.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.core.config import Settings, get_settings
from app.services.llm_service import LLMService
from app.services.stt_service import STTService
from app.services.tts_service import TTSService

SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_llm_service(settings: SettingsDep) -> LLMService:
    return LLMService(settings)


def get_stt_service(settings: SettingsDep) -> STTService:
    return STTService(settings)


def get_tts_service(settings: SettingsDep) -> TTSService:
    return TTSService(settings)


LLMServiceDep = Annotated[LLMService, Depends(get_llm_service)]
STTServiceDep = Annotated[STTService, Depends(get_stt_service)]
TTSServiceDep = Annotated[TTSService, Depends(get_tts_service)]
