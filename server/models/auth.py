from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class SetPasswordRequest(BaseModel):
    new_password: str


class UserResponse(BaseModel):
    id: str
    username: str
    role: str


class IamUserResponse(BaseModel):
    """A single account on the read-only admin IAM "Users & roles" screen (§9).

    Role resolves from `users.role_id`; `must_reset_password` surfaces the
    first-login "reset pending" status. No password/salt is ever returned."""

    id: str
    username: str
    display_name: str | None = None
    role: str | None = None
    is_active: bool
    must_reset_password: bool


class ClinicianResponse(BaseModel):
    """One entry in the `GET /api/clinicians` share-target directory (§5).

    The minimal clinical-staff directory an owner picks a colleague from: user
    `id` + `display_name` (full name) ONLY. Deliberately carries no PID/IAM fields
    (no username, email, role, or login state) so the recipient picker exposes a
    named person, not the account record."""

    id: str
    display_name: str


class TablePopulationHistoryItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    table_population_id: str = Field(alias="tablePopulationId")
    audit_id: str | None = None
    request: str | None = None
    filters: dict = {}
    started_at: str


class QueryHistoryItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str
    table_population_id: str | None = Field(default=None, alias="tablePopulationId")
    database: str | None = None
    query: str
    ts: str
