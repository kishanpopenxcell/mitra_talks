"""Text chat endpoint (streaming)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from app.api.deps import LLMServiceDep
from app.core.logging import get_logger
from app.schemas.chat import ChatStreamRequest
from app.utils.errors import AppError

logger = get_logger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


async def _sse_event_stream(
    llm_service: LLMServiceDep, request: ChatStreamRequest
) -> AsyncIterator[dict[str, str]]:
    """Build the SSE event sequence for a chat stream.

    Emits an optional `reaction` event first, then one `message` event per
    text delta, then a final `done` event on success, or an `error` event
    (with a clean human-readable message) if something fails mid-stream.
    Never emits a raw stack trace.
    """
    try:
        async for event in llm_service.stream_reply(request.mood, request.messages):
            if event.kind == "reaction":
                yield {"event": "reaction", "data": json.dumps({"reaction": event.value})}
            else:
                yield {"event": "message", "data": json.dumps({"delta": event.value})}
        yield {"event": "done", "data": json.dumps({"done": True})}
    except AppError as exc:
        logger.warning("Chat stream failed with AppError: %s", exc.detail)
        yield {"event": "error", "data": json.dumps({"detail": exc.detail})}
    except Exception:  # noqa: BLE001 - last-resort guard for the stream
        logger.exception("Unexpected error during chat stream")
        yield {
            "event": "error",
            "data": json.dumps(
                {"detail": "Something went wrong while generating a response."}
            ),
        }


@router.post(
    "/stream",
    summary="Stream a mood-aware AI chat reply",
    description=(
        "Accepts the selected mood and full conversation history (oldest "
        "first, ending with the latest user message) and streams the AI "
        "companion's reply as Server-Sent Events.\n\n"
        "Event types:\n"
        "- `reaction`: `{\"reaction\": str}` -- sent at most once, before any "
        "text, naming the facial reaction the companion chose for this reply "
        "(surprised, confused, wink, delighted, sheepish). Omitted when none.\n"
        "- `message`: `{\"delta\": str}` -- an incremental text chunk.\n"
        "- `done`: `{\"done\": true}` -- sent once when the reply is complete.\n"
        "- `error`: `{\"detail\": str}` -- sent if generation fails; the "
        "message is always safe to show to the user.\n\n"
        "History longer than `MAX_CONVERSATION_MESSAGES` is trimmed "
        "server-side (oldest messages dropped first) before being sent to "
        "the model."
    ),
)
async def chat_stream(
    request: ChatStreamRequest, llm_service: LLMServiceDep
) -> EventSourceResponse:
    return EventSourceResponse(_sse_event_stream(llm_service, request))
