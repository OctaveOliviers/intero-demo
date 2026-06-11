"""Data-generation endpoint.

For now this is a thin pass-through to the LLM: the user describes the data they
want (which fields, ordering, etc.) and we stream the model's response straight
back. Workbook creation/population from that description is a future step — this
exists so the front-end "describe the data you want" box can be wired and tested
end to end.
"""

import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from core.clients.llm import LLMConfigError, LLMRequestError, respond_stream
from server.models import GenerateRequest

logger = logging.getLogger(__name__)

router = APIRouter()

INSTRUCTIONS = (
    "You are a clinical-data assistant. The user describes the data they want — "
    "which fields, how to order or filter it, and so on. For now, respond in "
    "plain text describing how you would assemble that dataset. Be concise."
)


@router.post("/api/generate")
async def generate(body: GenerateRequest):
    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query is required.")

    async def event_source():
        try:
            async for chunk in respond_stream(INSTRUCTIONS, query):
                yield chunk
        except LLMConfigError as exc:
            logger.warning("generate: LLM not configured: %s", exc)
            yield f"\n[LLM not configured: {exc}]"
        except LLMRequestError as exc:
            logger.warning("generate: LLM request failed: %s", exc)
            yield f"\n[LLM error: {exc}]"

    return StreamingResponse(
        event_source(),
        media_type="text/plain; charset=utf-8",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
