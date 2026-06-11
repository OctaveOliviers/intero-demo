from pydantic import BaseModel


class IndexingStatus(BaseModel):
    kind: str  # audit | database
    id: str
    name: str
    status: str  # indexing | ready | error
    error: str | None = None
