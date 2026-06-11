"""Worker lifecycle: start the compute backends, wire the runner, tear down.

The server's only job at boot is to call ``startup()`` and, at shutdown,
``shutdown()``. Everything about *how* the worker reaches external compute (the
persistent opencode server + its HTTP client, the run-spawning runner) lives
here, not in the HTTP layer.
"""

from __future__ import annotations

import logging

from core import indexing
from core.running import stream_runner
from core.clients.opencode_client import OpenCodeClient
from core.clients.opencode_server import OpenCodeServer
from core.config import AGENT_DIR, OPENCODE_SERVER_HOST, OPENCODE_SERVER_PORT

logger = logging.getLogger(__name__)


class Runtime:
    """Holds the live worker backends so they can be cleanly shut down."""

    def __init__(self) -> None:
        self._server: OpenCodeServer | None = None
        self._client: OpenCodeClient | None = None

    async def startup(self) -> None:
        self._server = OpenCodeServer(host=OPENCODE_SERVER_HOST, port=OPENCODE_SERVER_PORT)
        url = await self._server.start()
        logger.info("opencode serve listening at %s", url)

        self._client = OpenCodeClient(base_url=url, directory=str(AGENT_DIR))
        await self._client.start()

        # Wire the spine stream/runtime seam used by /api/runs endpoints.
        stream_runner.runner = stream_runner.SpineRunBroker(self._client)

        # Re-launch any indexing that was interrupted by a previous shutdown.
        indexing.rescan_on_startup()

    async def shutdown(self) -> None:
        stream_runner.runner = None
        if self._client is not None:
            await self._client.close()
            self._client = None
        if self._server is not None:
            await self._server.stop()
            self._server = None
