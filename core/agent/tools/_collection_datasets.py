"""The ``datasets`` collection — navigation over the user's saved Datasets.

A Dataset (``datasets/<id>/dataset.json``, the ``dataset`` schema) is a saved,
named filter: a ``name`` + ``description`` plus grounded ``criteria`` over a
``cohort`` ([ADR 0005](../../../../specs/product/decisions/0005-navigation-is-a-generic-verb-set-over-collections.md)).
This is the ``datasets`` specialisation of the navigation verbs
(``_navigate_collections`` / navigation.md), a sibling of ``_collection_databases``:

- ``catalog`` (``ls``) lists every Dataset as ``{id, title, summary}``;
- ``search`` (``grep``) matches a keyword over a Dataset's ``name`` + ``description``
  and locates the whole ``dataset``;
- ``describe`` (``cat``) reads one Dataset — its ``description`` + ``criteria`` + the
  scope it resolves to (``cohort`` + ``databases`` + cached ``count``).

``join-paths`` does NOT apply: a Dataset is a filter with no measured edges
(navigation.md). Reads ``dataset.json`` ONLY (via ``_navigate.bound_datasets``) —
read-only, local-only, metadata only; never a SQLite database, never SQL, never
clinical cell values.
"""

from __future__ import annotations

from pathlib import Path

from _common import ToolError, require_string_value
from _navigate import bound_datasets


def _summary(dataset: dict) -> str | None:
    """The Dataset's one-line summary — the first sentence of ``description``.

    Mirrors ``_collection_databases._summary``'s description-first-sentence
    fallback (split on the first ``". "``); ``null`` when there is no description.
    """
    description = dataset.get("description")
    if isinstance(description, str) and description.strip():
        return description.split(". ", 1)[0]
    return None


def _described(dataset_id: str, dataset: dict) -> dict:
    """One Dataset read in full — its description + grounded criteria + the scope
    it resolves to. Metadata only: the criteria are the Dataset's own filter
    definition (a real column + a structured predicate), never clinical cells; the
    cached ``count`` (a derived row total) is included only when present."""
    described = {
        "id": dataset_id,
        "name": dataset.get("name"),
        "description": dataset.get("description"),
        "criteria": dataset.get("criteria") or [],
        "cohort": dataset.get("cohort"),
        "databases": dataset.get("databases") or [],
    }
    if "count" in dataset:
        described["count"] = dataset.get("count")
    return described


class DatasetsCollection:
    """The user's saved Datasets as a navigable collection."""

    name = "datasets"

    def catalog(self, cwd: Path) -> dict:
        datasets = [
            {
                "id": dataset_id,
                "title": dataset.get("name"),
                "summary": _summary(dataset),
            }
            for dataset_id, dataset in bound_datasets(cwd)
        ]
        return {"datasets": datasets}

    def search(self, cwd: Path, query: str) -> dict:
        needle = query.lower()
        matches: list[dict] = []
        for dataset_id, dataset in bound_datasets(cwd):
            # A Dataset is not a container of sub-items, so a hit locates the
            # WHOLE Dataset (its `dataset` path). Keywords ride on name +
            # description (the field name IS the `matched_on` category); `name` is
            # tried first so its category wins.
            for field in ("name", "description"):
                value = dataset.get(field)
                if isinstance(value, str) and needle in value.lower():
                    matches.append(
                        {
                            "dataset": dataset_id,
                            "matched_on": field,
                            "context": value,
                        }
                    )
        return {"query": query, "match_count": len(matches), "matches": matches}

    def describe(self, cwd: Path, request: dict) -> dict:
        dataset_id = require_string_value(request.get("dataset"), "dataset")
        by_id = dict(bound_datasets(cwd))
        dataset = by_id.get(dataset_id)
        if dataset is None:
            raise ToolError(
                f"no dataset {dataset_id!r}. The datasets you can navigate are: "
                f"{sorted(by_id)}."
            )
        return {"dataset": _described(dataset_id, dataset)}
