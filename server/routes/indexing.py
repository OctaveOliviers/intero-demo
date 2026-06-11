import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from core import indexing
from server.models import IndexingStatus

router = APIRouter()


@router.get("/api/indexing", response_model=list[IndexingStatus])
async def list_indexing():
    return [IndexingStatus(**entry) for entry in indexing.list_all()]


@router.get("/api/indexing/stream")
async def stream_indexing():
    async def event_source():
        # Send a snapshot so clients that connect mid-cycle see current state.
        for entry in indexing.list_all():
            yield f"data: {json.dumps(entry)}\n\n"
        async for event in indexing.subscribe():
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )
