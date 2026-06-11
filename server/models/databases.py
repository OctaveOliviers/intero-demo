from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DatabaseInfo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    description: str
    type: str = "sqlite"
    path: str
    status: str = "ready"  # indexing | ready | error
    level: str = "Local"
    read_only: bool = Field(default=False, alias="readOnly")
    stale: bool = False
    version: str | None = None
    scheme: str | None = None
    last_pulled: str | None = Field(default=None, alias="lastPulled")
    provenance_ref: str | None = Field(default=None, alias="provenanceRef")
    provenance_url: str | None = Field(default=None, alias="provenanceUrl")


class DatabaseUploadResponse(BaseModel):
    id: str
    name: str
    status: str  # indexing | ready | error


class DatabaseRenameRequest(BaseModel):
    name: str


class DatabaseDetailResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    description: str
    type: str = "sqlite"
    path: str
    status: str = "ready"
    level: str = "Local"
    read_only: bool = Field(default=False, alias="readOnly")
    stale: bool = False
    version: str | None = None
    scheme: str | None = None
    last_pulled: str | None = Field(default=None, alias="lastPulled")
    provenance_ref: str | None = Field(default=None, alias="provenanceRef")
    provenance_url: str | None = Field(default=None, alias="provenanceUrl")
    model: dict[str, Any]
