from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: str
    username: str


class RunHistoryItem(BaseModel):
    run_id: str
    audit_id: str | None = None
    request: str | None = None
    filters: dict = {}
    started_at: str
