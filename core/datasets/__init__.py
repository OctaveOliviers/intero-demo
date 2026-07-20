"""The Dataset primitive — a saved, named filter over the hospital database.

A Dataset scopes the database to a slice (library-and-sources.md). It is **purely
a filter**: it never copies or owns data. This package owns the Dataset object and
its persistence under ``var/datasets/<id>/dataset.json`` (the additive ``dataset``
storage contract). Grounding free text into criteria lives in
:mod:`core.mapping.ground_default_criteria`; composing criteria into the executable
cohort + the read-only COUNT lives in :mod:`core.filters`.
"""

from core.datasets.store import (  # noqa: F401
    DatasetError,
    display_predicate,
    list_summaries,
    load_dataset,
    rederive,
    save_dataset,
)
