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

import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Literal

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

# ---------------------------------------------------------------------------
# Facial reactions
#
# The system prompt (app/mood/prompt_builder.py) asks the model to open every
# reply with `[react:<name>]`. We strip that tag here -- it must never reach
# TTS or the transcript -- and surface the name as structured data so the
# frontend can animate Mitra's face. `none` and anything unrecognised map to
# no reaction. Must stay in sync with the frontend's `Reaction` type.
# ---------------------------------------------------------------------------

REACTIONS: frozenset[str] = frozenset(
    {"surprised", "confused", "delighted", "sheepish"}
)

_REACTION_TAG_RE = re.compile(r"^\s*\[\s*react\s*:\s*([a-zA-Z_]+)\s*\]\s*", re.IGNORECASE)

# If the reply starts with "[" we hold text back until the tag closes, but never
# more than this many characters -- past that it isn't a tag, flush it.
_MAX_TAG_BUFFER = 40


def split_reaction(text: str) -> tuple[str | None, str]:
    """Split a leading `[react:x]` tag off `text`. Returns (reaction, remainder)."""
    match = _REACTION_TAG_RE.match(text)
    if not match:
        return None, text
    name = match.group(1).lower()
    return (name if name in REACTIONS else None), text[match.end() :]


@dataclass(frozen=True)
class ReplyEvent:
    """One item of a streamed reply: the reaction (at most once, first) or a text delta."""

    kind: Literal["reaction", "delta"]
    value: str


@dataclass(frozen=True)
class GeneratedReply:
    """A complete non-streamed reply with its reaction tag already removed."""

    text: str
    reaction: str | None


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
    ) -> AsyncIterator[ReplyEvent]:
        """Yield the reply as events: an optional leading reaction, then text deltas.

        The model is asked to open with a `[react:x]` tag. Text is buffered only
        until that tag is resolved (or ruled out), so the first visible words
        arrive with negligible extra latency and the tag itself never leaks.
        """
        self._require_configured()
        trimmed = _trim_history(history, self._settings.max_conversation_messages)
        lc_messages = _to_langchain_messages(mood, trimmed)
        chat_model = _build_chat_model(self._settings)

        buffer = ""
        decided = False

        def _resolve(text: str) -> list[ReplyEvent]:
            reaction, rest = split_reaction(text)
            events: list[ReplyEvent] = []
            if reaction:
                events.append(ReplyEvent("reaction", reaction))
            if rest:
                events.append(ReplyEvent("delta", rest))
            return events

        try:
            async for chunk in chat_model.astream(lc_messages):
                content = chunk.content
                if not content:
                    continue
                text = str(content)

                if decided:
                    yield ReplyEvent("delta", text)
                    continue

                buffer += text
                stripped = buffer.lstrip()
                if not stripped:
                    continue
                if not stripped.startswith("[") or "]" in stripped or len(stripped) > _MAX_TAG_BUFFER:
                    decided = True
                    for event in _resolve(buffer):
                        yield event
                    buffer = ""

            if not decided and buffer:
                for event in _resolve(buffer):
                    yield event
        except Exception as exc:  # noqa: BLE001 - translate to a clean AppError
            logger.exception("LLM streaming failed")
            raise _map_hf_error(exc) from exc

    async def generate_reply(
        self, mood: Mood, history: list[ChatMessage]
    ) -> GeneratedReply:
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
        reaction, text = split_reaction(str(content) if content else "")
        return GeneratedReply(text=text.strip(), reaction=reaction)
