from typing import Literal

from pydantic import BaseModel, Field


class ThreadSummary(BaseModel):
    """The Threads-list row: just enough to render a recency-ordered card."""

    id: str
    title: str
    updated_at: str
    message_count: int
    status: Literal["running", "complete"] = "complete"
    opened: bool = False


class ThreadRenameRequest(BaseModel):
    """Rename a thread: replaces only its display ``title``."""

    title: str


class ThreadAttachment(BaseModel):
    """A library item pinned to the next user message."""

    type: Literal["dataset", "template"]
    id: str


class ThreadCreateRequest(BaseModel):
    """Create a thread. With ``message`` given, the first user message is appended,
    passed to the agent, and the agent resolution message is appended; the title
    is derived from it. Omitted/empty ⇒ an empty thread titled "New thread"."""

    message: str | None = None
    attachments: list[ThreadAttachment] = Field(default_factory=list)


class ThreadMessageRequest(BaseModel):
    """Post a user message into a thread: it is appended, passed to the agent, and
    the agent resolution message is appended."""

    content: str
    attachments: list[ThreadAttachment] = Field(default_factory=list)


class ThreadQuestionAnswer(BaseModel):
    """One answer to an agent-issued ask_user_question item."""

    question_id: str
    status: Literal["answered", "skipped"]
    choice_id: str | None = None
    text: str | None = None


class ThreadQuestionAnswersRequest(BaseModel):
    """The completed composer answer payload for a pending question request."""

    answers: list[ThreadQuestionAnswer]
