"""Re-export every model so callers can `from server.models import X` regardless
of which submodule X lives in. Add new models to the right submodule, then list
them here."""

from server.models.auth import (
    ClinicianResponse,
    IamUserResponse,
    LoginRequest,
    QueryHistoryItem,
    SetPasswordRequest,
    TablePopulationHistoryItem,
    UserResponse,
)
from server.models.databases import (
    DatabaseDetailResponse,
    DatabaseInfo,
    DatabaseRenameRequest,
    DatabaseUploadResponse,
)
from server.models.datasets import (
    DatasetCreateRequest,
    DatasetFilterRequest,
    DatasetPatchRequest,
    DatasetSummary,
)
from server.models.generate import GenerateRequest
from server.models.health import HealthResponse
from server.models.indexing import IndexingStatus
from server.models.table_populations import (
    ChipMessage,
    TablePopulationCellEditRequest,
    TablePopulationCellEditResponse,
    TablePopulationCreateFromAuditRequest,
    TablePopulationCreateResponse,
    TablePopulationRefreshResponse,
    TablePopulationStateResponse,
    TextMessage,
)
from server.models.sql import ChatCitationEvidenceRequest, SqlQuery, SqlResponse
from server.models.tables import (
    TableColumn,
    TableCreateRequest,
    TableRenameRequest,
    TableSpec,
    TableSummary,
)
from server.models.templates import (
    TemplateDetailResponse,
    TemplateInfo,
    TemplateMappingPatchRequest,
    TemplateMappingPatchResponse,
    TemplateRenameRequest,
    TemplateUploadResponse,
)
from server.models.threads import (
    ThreadAttachment,
    ThreadCreateRequest,
    ThreadMessageRequest,
    ThreadQuestionAnswersRequest,
    ThreadRenameRequest,
    ThreadSummary,
)
from server.models.workbook import (
    SheetColumnMeta,
    SheetData,
    SheetMeta,
    WorkbookResponse,
)

__all__ = [
    "ChipMessage",
    "ChatCitationEvidenceRequest",
    "ClinicianResponse",
    "DatabaseInfo",
    "DatabaseDetailResponse",
    "DatabaseRenameRequest",
    "DatabaseUploadResponse",
    "DatasetCreateRequest",
    "DatasetFilterRequest",
    "DatasetPatchRequest",
    "DatasetSummary",
    "GenerateRequest",
    "HealthResponse",
    "IamUserResponse",
    "IndexingStatus",
    "LoginRequest",
    "TablePopulationCreateFromAuditRequest",
    "TablePopulationCreateResponse",
    "TablePopulationRefreshResponse",
    "TablePopulationCellEditRequest",
    "TablePopulationCellEditResponse",
    "QueryHistoryItem",
    "TablePopulationHistoryItem",
    "TablePopulationStateResponse",
    "SetPasswordRequest",
    "SheetColumnMeta",
    "SheetData",
    "SheetMeta",
    "SqlQuery",
    "SqlResponse",
    "TableColumn",
    "TableCreateRequest",
    "TableRenameRequest",
    "TableSpec",
    "TableSummary",
    "TemplateInfo",
    "TemplateDetailResponse",
    "TemplateMappingPatchRequest",
    "TemplateMappingPatchResponse",
    "TemplateRenameRequest",
    "TemplateUploadResponse",
    "TextMessage",
    "ThreadAttachment",
    "ThreadCreateRequest",
    "ThreadMessageRequest",
    "ThreadQuestionAnswersRequest",
    "ThreadRenameRequest",
    "ThreadSummary",
    "UserResponse",
    "WorkbookResponse",
]
