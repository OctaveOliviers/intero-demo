from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class TemplateInfo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    description: str
    excel_path: str = Field(alias="excelPath")
    status: str = "ready"  # indexing | ready | error
    level: str = "Local"
    read_only: bool = Field(default=False, alias="readOnly")
    stale: bool = False
    version: str | None = None
    scheme: str | None = None
    last_pulled: str | None = Field(default=None, alias="lastPulled")
    provenance_ref: str | None = Field(default=None, alias="provenanceRef")
    provenance_url: str | None = Field(default=None, alias="provenanceUrl")
    # Submission deadline (ISO date) from spec.json `deadline` — doc 9 card face.
    deadline: str | None = None


class TemplateUploadResponse(BaseModel):
    id: str
    name: str
    status: str  # indexing | ready | error


class TemplateRenameRequest(BaseModel):
    name: str


class TemplateMappingPatchRequest(BaseModel):
    # The full replacement fixed_criteria array (doc 4 §The fixed inclusion
    # criteria): each entry references a criteria_bindings[].criterion_id and
    # carries the fixed predicate. Validated against mapping.schema.json.
    fixed_criteria: list[dict[str, Any]]


class TemplateMappingPatchResponse(BaseModel):
    id: str
    fixed_criteria: list[dict[str, Any]]


class TemplateDetailResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    description: str
    excel_path: str = Field(alias="excelPath")
    status: str = "ready"
    level: str = "Local"
    read_only: bool = Field(default=False, alias="readOnly")
    stale: bool = False
    version: str | None = None
    scheme: str | None = None
    last_pulled: str | None = Field(default=None, alias="lastPulled")
    provenance_ref: str | None = Field(default=None, alias="provenanceRef")
    provenance_url: str | None = Field(default=None, alias="provenanceUrl")
    deadline: str | None = None
    spec: dict[str, Any]
    mapping: dict[str, Any] | None = None
