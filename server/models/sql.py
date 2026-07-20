from pydantic import BaseModel, ConfigDict, Field


class SqlQuery(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    query: str
    database: str | None = None
    table_population_id: str | None = Field(default=None, alias="tablePopulationId")


class ChatCitationEvidenceRequest(BaseModel):
    thread_id: str | None = Field(default=None, alias="thread_id")
    message_index: int | None = Field(default=None, alias="message_index")
    marker: str | None = None
    covered_row_index: int | None = Field(default=None, alias="covered_row_index")


class SqlResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    columns: list[str]
    rows: list[list]
    row_count: int = Field(alias="rowCount")
    duration_ms: int = Field(alias="durationMs")
