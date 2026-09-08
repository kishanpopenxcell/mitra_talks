"""Request/response schemas for the text chat endpoint."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from app.mood.config import Mood


class ChatMessage(BaseModel):
    """A single turn in the conversation history."""

    role: str = Field(description="Either 'user' or 'assistant'.")
    content: str = Field(description="The message text.", min_length=1)

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        if value not in ("user", "assistant"):
            raise ValueError("role must be 'user' or 'assistant'")
        return value

    @field_validator("content")
    @classmethod
    def validate_content_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("content must not be blank")
        return value


class ChatStreamRequest(BaseModel):
    """Request body for `POST /api/chat/stream`."""

    mood: Mood = Field(description="The user's currently selected mood.")
    messages: list[ChatMessage] = Field(
        description=(
            "Full conversation history so far, oldest first. Must contain at "
            "least one message and the last message must be from the user."
        ),
        min_length=1,
    )

    @field_validator("messages")
    @classmethod
    def validate_last_message_is_user(
        cls, value: list[ChatMessage]
    ) -> list[ChatMessage]:
        if not value:
            raise ValueError("messages must not be empty")
        if value[-1].role != "user":
            raise ValueError("the last message must be from the user")
        return value
