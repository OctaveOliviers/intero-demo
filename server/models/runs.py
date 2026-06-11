from pydantic import BaseModel, ConfigDict, Field


class TextMessage(BaseModel):
    role: str = "assistant"
    type: str = "text"
    content: str


class ChipMessage(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    role: str = "assistant"
    type: str = "chip"
    label: str = "result.xlsx"
    workbook_url: str = Field(alias="workbookUrl")
    download_url: str = Field(alias="downloadUrl")


class RunCreateResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    run_id: str = Field(alias="runId")
    messages: list[TextMessage | ChipMessage]


class RunStateResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    run_id: str = Field(alias="runId")
    status: str
    messages: list[TextMessage | ChipMessage]


class RunRefreshResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    run_id: str = Field(alias="runId")
    execution_id: str = Field(alias="executionId")
    status: str


class RunCreateFromAuditRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    audit_id: str = Field(alias="auditId")
    prompt: str | None = None
    filters: dict[str, str] = Field(default_factory=dict)
    database: str | None = None


class RunCellEditRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    review_state: str | None = Field(default=None, alias="reviewState")
    corrected: bool | None = None
    value: str | None = None


class RunCellEditResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    run_id: str = Field(alias="runId")
    ref: str
    review_state: str | None = Field(alias="reviewState")
    corrected: bool | None = None
    value: str | None = None
