"""The ``templates`` collection — navigation over the saved table templates.

A sibling of ``_collection_databases`` (``_navigate_collections`` / navigation.md /
[ADR 0005](../../../../specs/product/decisions/0005-navigation-is-a-generic-verb-set-over-collections.md)):
the same three verbs over the user's saved table templates, each an audit
``spec.json`` (``audit-spec.schema.json``). ``catalog`` lists the templates,
``search`` greps their fields, ``describe`` reads one template (or one field).

The ADR records the isomorphism this collection rides on — a template is
structurally near a database table: ``template.description ≈ table.description``,
``field.notes ≈ column.description``, ``field.permitted_values ≈ column.codes``,
``field.type ≈ column.type``. So the output shapes mirror the databases
collection, only the backing artifact differs.

Reads ``templates/<id>/spec.json`` (via ``_navigate.bound_templates``) ONLY — never a
SQLite database, never SQL. Read-only, local-only, metadata only — never clinical
cell values.
"""

from __future__ import annotations

from pathlib import Path

from _common import ToolError, optional_string, require_string_value
from _navigate import bound_templates


def _find_field(spec: dict, field: str) -> dict | None:
    """The spec field addressed by ``field`` — its ``id`` (the stable slug) or,
    as a fallback, its published ``name``. None when neither matches."""
    records = [f for f in spec.get("fields") or [] if isinstance(f, dict)]
    for record in records:
        if record.get("id") == field:
            return record
    for record in records:
        if record.get("name") == field:
            return record
    return None


def _described_field(field: dict) -> dict:
    """Map one spec field to the navigation field shape (ADR 0005 isomorphism).

    ``name`` ← ``name``, ``type`` ← ``type`` (the format slot is the field's
    ``format`` when present), ``description`` ← ``notes``, ``codes`` ←
    ``permitted_values``. ``codes`` is omitted when the field carries none — the
    same way the databases collection omits a column's empty ``codes``."""
    described = {
        "name": field.get("name"),
        "type": field.get("type"),
        "format": field.get("format"),
        "description": field.get("notes"),
    }
    codes = field.get("permitted_values")
    if isinstance(codes, dict) and codes:
        described["codes"] = codes
    return described


def _field_matches(field: dict, needle: str) -> list[tuple[str, str]]:
    """The (matched_on, context) hits for one field, in category order —
    mirrors ``_collection_databases._column_matches``."""
    hits: list[tuple[str, str]] = []

    name = field.get("name")
    if isinstance(name, str) and needle in name.lower():
        hits.append(("field_name", name))

    notes = field.get("notes")
    if isinstance(notes, str) and needle in notes.lower():
        hits.append(("field_description", notes))

    # A code label hit emits ONE entry; join every matching "code: meaning" pair.
    codes = field.get("permitted_values")
    if isinstance(codes, dict):
        labels = [
            f"{code}: {meaning}"
            for code, meaning in codes.items()
            if needle in str(code).lower() or needle in str(meaning).lower()
        ]
        if labels:
            hits.append(("code_label", "; ".join(labels)))

    return hits


def _summary(spec: dict) -> str | None:
    """The template's one-line ``summary``, with the description-first-sentence
    fallback — mirrors ``_collection_databases._summary``."""
    summary = spec.get("summary")
    if isinstance(summary, str) and summary.strip():
        return summary

    description = spec.get("description")
    if isinstance(description, str) and description.strip():
        return description.split(". ", 1)[0]

    return None


class TemplatesCollection:
    """The user's saved table templates as a navigable collection."""

    name = "templates"

    def catalog(self, cwd: Path) -> dict:
        templates = [
            {
                "id": template_id,
                "title": spec.get("title"),
                "summary": _summary(spec),
            }
            for template_id, spec in bound_templates(cwd)
        ]
        return {"templates": templates}

    def search(self, cwd: Path, query: str) -> dict:
        needle = query.lower()
        matches: list[dict] = []
        for template_id, spec in bound_templates(cwd):
            title = spec.get("title")
            if isinstance(title, str) and needle in title.lower():
                matches.append(
                    {
                        "template": template_id,
                        "field": None,
                        "matched_on": "template_name",
                        "context": title,
                    }
                )
            description = spec.get("description")
            if isinstance(description, str) and needle in description.lower():
                matches.append(
                    {
                        "template": template_id,
                        "field": None,
                        "matched_on": "template_description",
                        "context": description,
                    }
                )

            for field in spec.get("fields") or []:
                if not isinstance(field, dict):
                    continue
                for matched_on, context in _field_matches(field, needle):
                    matches.append(
                        {
                            "template": template_id,
                            "field": field.get("id"),
                            "matched_on": matched_on,
                            "context": context,
                        }
                    )

        return {"query": query, "match_count": len(matches), "matches": matches}

    def describe(self, cwd: Path, request: dict) -> dict:
        template = require_string_value(request.get("template"), "template")
        templates = dict(bound_templates(cwd))
        spec = templates.get(template)
        if spec is None:
            raise ToolError(
                f"no template {template!r}. The templates available to you are: "
                f"{sorted(templates)}."
            )

        described = {
            "template": template,
            "grain": spec.get("grain"),
            "description": spec.get("description"),
        }

        field = optional_string(request.get("field"), "field")
        if field is not None:
            record = _find_field(spec, field)
            if record is None:
                ids = [
                    f.get("id") for f in spec.get("fields") or [] if isinstance(f, dict)
                ]
                raise ToolError(
                    f"no field {field!r} in template {template!r}. The fields here "
                    f"are: {ids}."
                )
            described["field"] = _described_field(record)
            return described

        described["fields"] = [
            _described_field(f) for f in spec.get("fields") or [] if isinstance(f, dict)
        ]
        return described
