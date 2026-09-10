"""Voice endpoints: transcribe, speak, and full converse (STT -> LLM -> TTS)."""

from __future__ import annotations

import json

from fastapi import APIRouter, Form, Response, UploadFile
from pydantic import ValidationError

from app.api.deps import LLMServiceDep, STTServiceDep, TTSServiceDep
from app.core.logging import get_logger
from app.mood.config import Mood
from app.schemas.chat import ChatMessage
from app.schemas.voice import ConverseResponse, SpeakRequest, TranscribeResponse
from app.utils.audio import audio_bytes_to_base64, looks_like_valid_audio
from app.utils.errors import InvalidAudioError, InvalidRequestError, TTSError
from app.utils.transcript import is_intelligible, repeat_request

logger = get_logger(__name__)

router = APIRouter(prefix="/api/voice", tags=["voice"])


async def _read_and_validate_audio(audio: UploadFile) -> bytes:
    data = await audio.read()
    if not looks_like_valid_audio(audio.content_type, data):
        raise InvalidAudioError(
            "The uploaded audio could not be read. Please try recording again."
        )
    return data


@router.post(
    "/transcribe",
    response_model=TranscribeResponse,
    summary="Transcribe recorded audio to text",
    description=(
        "Accepts a multipart form upload with an `audio` file field "
        "(webm/ogg/wav from the browser's MediaRecorder) and returns the "
        "transcribed text using Hugging Face Whisper (with an optional "
        "Groq fallback)."
    ),
)
async def transcribe(
    stt_service: STTServiceDep, audio: UploadFile
) -> TranscribeResponse:
    data = await _read_and_validate_audio(audio)
    text = await stt_service.transcribe(data, audio.content_type)
    return TranscribeResponse(text=text)


@router.post(
    "/speak",
    summary="Synthesize speech audio from text",
    description=(
        "Accepts text and returns raw WAV audio bytes (`Content-Type: "
        "audio/wav`) synthesized via Cartesia. If text-to-speech is "
        "unavailable or fails, responds with a JSON error body (503) "
        "containing `detail`/`error_code` instead of audio -- the frontend "
        "should treat any non-audio response from this endpoint as 'TTS "
        "unavailable, fall back to browser-native speech synthesis'."
    ),
    responses={
        200: {
            "content": {"audio/wav": {}},
            "description": "Raw WAV audio bytes of the synthesized speech.",
        },
        503: {"description": "TTS unavailable or failed; see `detail` for a clean message."},
    },
)
async def speak(request: SpeakRequest, tts_service: TTSServiceDep) -> Response:
    audio_bytes = await tts_service.synthesize(request.text)
    return Response(content=audio_bytes, media_type="audio/wav")


@router.post(
    "/converse",
    response_model=ConverseResponse,
    summary="Full voice turn: transcribe, generate a mood-aware reply, and speak it",
    description=(
        "Accepts a multipart form with:\n"
        "- `audio`: the recorded user audio file.\n"
        "- `mood`: the selected mood (string, one of the 8 supported moods).\n"
        "- `history`: a JSON-encoded array of prior `{role, content}` "
        "messages (same shape as `/api/chat/stream`), or an empty array.\n\n"
        "Runs STT -> mood-aware LLM (single non-streamed reply, since this "
        "is a turn-based voice exchange) -> TTS, and returns everything in "
        "one JSON response. Audio is base64-encoded here (unlike "
        "`/api/voice/speak`, which returns raw bytes) because this endpoint "
        "must return structured JSON combining the transcript, reply text, "
        "and audio together. If TTS fails, `tts_available` is `false` and "
        "`audio_base64` is `null` -- the transcript and reply text are "
        "still returned so the frontend can fall back to browser-native "
        "speech synthesis without losing the conversation turn."
    ),
)
async def converse(
    llm_service: LLMServiceDep,
    stt_service: STTServiceDep,
    tts_service: TTSServiceDep,
    audio: UploadFile,
    mood: str = Form(...),
    history: str = Form(default="[]"),
) -> ConverseResponse:
    try:
        mood_value = Mood(mood)
    except ValueError as exc:
        raise InvalidRequestError(
            f"'{mood}' is not a supported mood."
        ) from exc

    try:
        history_raw = json.loads(history)
        history_messages = [ChatMessage.model_validate(item) for item in history_raw]
    except (json.JSONDecodeError, ValidationError, TypeError) as exc:
        raise InvalidRequestError(
            "The conversation history field is malformed."
        ) from exc

    audio_bytes = await _read_and_validate_audio(audio)
    transcript = (await stt_service.transcribe(audio_bytes, audio.content_type)).strip()

    if not is_intelligible(transcript):
        # Silence, noise, a Whisper hallucination, or the wrong language: don't
        # guess and don't involve the model -- ask the user to say it again.
        logger.info("Unintelligible transcript discarded (%d chars)", len(transcript))
        ask = repeat_request()
        ask_audio, ask_tts = await _synthesize_optional(tts_service, ask)
        return ConverseResponse(
            transcript="",
            reply_text=ask,
            audio_base64=ask_audio,
            tts_available=ask_tts,
            reaction="confused",
            understood=False,
        )

    full_history = [*history_messages, ChatMessage(role="user", content=transcript)]
    reply = await llm_service.generate_reply(mood_value, full_history)

    audio_base64, tts_available = await _synthesize_optional(tts_service, reply.text)

    return ConverseResponse(
        transcript=transcript,
        reply_text=reply.text,
        audio_base64=audio_base64,
        tts_available=tts_available,
        reaction=reply.reaction,
        understood=True,
    )


async def _synthesize_optional(tts_service: TTSServiceDep, text: str) -> tuple[str | None, bool]:
    """TTS that degrades to (None, False) instead of failing the turn."""
    if not text:
        return None, False
    try:
        return audio_bytes_to_base64(await tts_service.synthesize(text)), True
    except TTSError as exc:
        logger.warning("TTS failed during /converse, continuing without audio: %s", exc.detail)
        return None, False
