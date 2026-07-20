"""Phase 2 of the audit pipeline: bind one audit template to one database.

Takes the audit's database-agnostic Field Spec (`spec.json`) and the database's
schema model (`model.json`), both from the indexing phase, and computes a
`mapping.json` document (match + executable in one file) saying where each
audit field's value lives. Runs lazily at run-start and is cached per
(audit, database) pair. See :mod:`core.mapping.build_audit_database_map` for
the implementation.

This package's interface is exactly what is exported here — the mapping phase
seen from outside:

- :func:`build_audit_database_mapping` / :func:`ensure_mapping` — build (or
  lazily reuse) the ``mapping.json`` for an (audit, databases) pair.
- :func:`ground_criteria` — ground a clinician's free-text filter phrase in the
  databases' filterable surface (the Dataset creation path).
- :func:`validate_populate_spec` / :func:`fold_executable` — the executable
  compiler: fold the derived executable into a mapping, and validate one before
  a run consumes it.

The submodules are implementation; import from the package, not from them.
"""

from core.mapping.build_audit_database_map import (
    build_audit_database_mapping,
    ensure_mapping,
)
from core.mapping.build_populate_spec import fold_executable, validate_populate_spec
from core.mapping.ground_default_criteria import ground_criteria

__all__ = [
    "build_audit_database_mapping",
    "ensure_mapping",
    "fold_executable",
    "ground_criteria",
    "validate_populate_spec",
]
