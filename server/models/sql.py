from pydantic import BaseModel, ConfigDict, Field


class SqlQuery(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    query: str
    database: str | None = None
    run_id: str | None = Field(default=None, alias="runId")


class SqlResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    columns: list[str]
    rows: list[list]
    row_count: int = Field(alias="rowCount")
    duration_ms: int = Field(alias="durationMs")
