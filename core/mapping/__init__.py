"""Phase 2 of the audit pipeline: bind one audit template to one database.

Takes the audit's database-agnostic Field Spec (`spec.json`) and the database's
schema model (`model.json`), both from the indexing phase, and computes a
`mapping.json` document (match + executable in one file) saying where each
audit field's value lives. Runs lazily at run-start and is cached per
(audit, database) pair. See :mod:`core.mapping.build_audit_database_map` for
the implementation.
"""

from core.mapping.build_audit_database_map import build_audit_database_mapping, ensure_mapping

__all__ = ["build_audit_database_mapping", "ensure_mapping"]
