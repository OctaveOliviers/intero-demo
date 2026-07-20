"""The thread primitive — the free-ranging, unscoped conversation surface.

A **thread** is the only conversation surface (product-flows.md §Threads, tables &
outputs). It **roams**: it carries no fixed Dataset — *each message* resolves its
own scope (decisions/0004-scope-binds-to-table-not-thread.md). A thread **persists**
(recency-ordered, searchable, deletable) and **does not fork**.

This package owns:

- :mod:`core.threads.store` — persistence and message assembly. Request
  interpretation belongs to the agent; this package does not pre-route messages.
"""

from core.threads.store import (  # noqa: F401
    ThreadError,
    append_agent_message,
    append_user_message,
    delete_thread,
    list_summaries,
    load_thread,
    new_thread,
    save_thread,
)
