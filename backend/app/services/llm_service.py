"""LLM chat service: LangChain pipeline over the Hugging Face chat model.

Pipeline: selected mood -> mood-specific system prompt (app/mood) ->
trimmed conversation context -> `ChatHuggingFace` (LangChain) -> response.

LangChain is used meaningfully here, not decoratively:
- `ChatPromptTemplate` builds the final prompt (system + trimmed history)
  from a `MessagesPlaceholder`, keeping prompt construction declarative and
  swappable independently of the HF client wiring.
- `ChatHuggingFace` (wrapping `HuggingFaceEndpoint`) is LangChain's chat
  model abstraction over Hugging Face Inference Providers. Swapping to a
  different provider/model later (or even a different LangChain chat model
  entirely) only touches `_build_chat_model()` below -- the API layer
  (`app/api/routes/chat.py`) never talks to LangChain or Hugging Face
  directly.
- Streaming uses the standard LangChain `Runnable.astream()` interface, so
  the SSE route just iterates chunks without knowing anything about HF.

We intentionally do NOT use LangChain memory/agents/tools/RAG modules --
per project_details.md this MVP has no persistent memory and needs no
agentic tooling. History is just the list of messages the frontend sent for
this request.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from huggingface_hub.errors import HfHubHTTPError
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint

from app.core.config import Settings
from app.core.logging import get_logger
from app.mood.config import Mood
from app.mood.prompt_builder import build_system_prompt
from app.schemas.chat import ChatMessage
from app.utils.errors import (
    ConfigurationError,
    InvalidTokenError,
    ProviderUnavailableError,
    RateLimitError,
    UpstreamServiceError,
    UpstreamTimeoutError,
)

logger = get_logger(__name__)


def _trim_history(
    messages: list[ChatMessage], max_messages: int
) -> list[ChatMessage]:
    """Keep only the most recent `max_messages` turns.

    Controls token usage/cost per project_details.md's Performance section.
    The system prompt is added separately and does not count against this cap.
    """
    if len(messages) <= max_messages:
        return messages
    return messages[-max_messages:]


def _to_langchain_messages(
    mood: Mood, history: list[ChatMessage]
) -> list[SystemMessage | HumanMessage | AIMessage]:
    system_prompt = build_system_prompt(mood)
    lc_messages: list[SystemMessage | HumanMessage | AIMessage] = [
        SystemMessage(content=system_prompt)
    ]
    for msg in history:
        if msg.role == "user":
            lc_messages.append(HumanMessage(content=msg.content))
        else:
            lc_messages.append(AIMessage(content=msg.content))
    return lc_messages


def _build_chat_model(settings: Settings) -> ChatHuggingFace:
    """Construct the LangChain chat model wrapping HF Inference Providers.

    Isolated so that swapping the underlying model/provider (or even the
    LangChain chat model class entirely) never requires touching the API
    layer.
    """
    endpoint = HuggingFaceEndpoint(
        repo_id=settings.hf_llm_model,
        provider=settings.hf_llm_provider,
        huggingfacehub_api_token=settings.hf_token,
        max_new_tokens=settings.max_response_tokens,
        temperature=0.7,
        timeout=settings.request_timeout_seconds,
    )
    return ChatHuggingFace(llm=endpoint)


def _map_hf_error(exc: Exception) -> Exception:
    """Translate a raw HF/LangChain exception into a clean AppError."""
    if isinstance(exc, HfHubHTTPError):
        status_code = exc.response.status_code if exc.response is not None else None
        if status_code == 401:
            return InvalidTokenError(
                "The Hugging Face token is invalid or unauthorized."
            )
        if status_code == 404:
            return ProviderUnavailableError(
                "The configured AI model or provider is not currently available."
            )
        if status_code == 429:
            return RateLimitError(
                "The AI service's free usage allowance has been reached. "
                "Please try again later."
            )
        if status_code and 500 <= status_code < 600:
            return UpstreamServiceError(
                "The AI service is temporarily unavailable. Please try again."
            )
        return UpstreamServiceError("The AI service returned an unexpected error.")

    message = str(exc).lower()
    if "timeout" in message or "timed out" in message:
        return UpstreamTimeoutError("The AI service took too long to respond.")
    if "401" in message or "unauthorized" in message:
        return InvalidTokenError("The Hugging Face token is invalid or unauthorized.")
    if "429" in message or "rate limit" in message or "quota" in message:
        return RateLimitError(
            "The AI service's free usage allowance has been reached. "
            "Please try again later."
        )
    return UpstreamServiceError("The AI service returned an unexpected error.")


class LLMService:
    """Mood-aware conversational LLM service backed by LangChain + HF."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def _require_configured(self) -> None:
        if not self._settings.hf_configured:
            raise ConfigurationError(
                "The AI service is not configured on the server (missing "
                "Hugging Face token). Please contact the administrator."
            )

    async def stream_reply(
        self, mood: Mood, history: list[ChatMessage]
    ) -> AsyncIterator[str]:
        """Yield text deltas for a streamed chat response."""
        self._require_configured()
        trimmed = _trim_history(history, self._settings.max_conversation_messages)
        lc_messages = _to_langchain_messages(mood, trimmed)
        chat_model = _build_chat_model(self._settings)

        try:
            async for chunk in chat_model.astream(lc_messages):
                content = chunk.content
                if content:
                    yield str(content)
        except Exception as exc:  # noqa: BLE001 - translate to a clean AppError
            logger.exception("LLM streaming failed")
            raise _map_hf_error(exc) from exc

    async def generate_reply(self, mood: Mood, history: list[ChatMessage]) -> str:
        """Generate a single non-streamed reply (used by the voice/converse flow)."""
        self._require_configured()
        trimmed = _trim_history(history, self._settings.max_conversation_messages)
        lc_messages = _to_langchain_messages(mood, trimmed)
        chat_model = _build_chat_model(self._settings)

        try:
            result = await chat_model.ainvoke(lc_messages)
        except Exception as exc:  # noqa: BLE001 - translate to a clean AppError
            logger.exception("LLM generation failed")
            raise _map_hf_error(exc) from exc

        content = result.content
        return str(content) if content else ""
