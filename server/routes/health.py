from fastapi import APIRouter

from server.models import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Lightweight liveness probe so the frontend can confirm the server is up
    before initiating any operation."""
    return HealthResponse(status="ok")
