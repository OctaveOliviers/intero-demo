"""Derive a multi-database Dataset's cohort base from measured identity links.

A Dataset scopes the hospital database; when it spans several databases its cohort
``FROM`` must join the extra databases onto a primary **anchor** identity, and it
must REFUSE to join a database it cannot measurably link (inclusion-criteria-setup.md
§Cross-database resolution). This module is the deterministic, LLM-free derivation
step: given the anchor and the participating databases' ``model.json``, it builds the
``cohort_block`` :mod:`core.filters.cohort` then composes and counts — never its own
ATTACH/COUNT — and reports which databases are linkable vs unlinkable.

A join is emitted ONLY on a **measured** identity link: an ``identity_links`` entry
whose ``column`` lives on the anchor table, whose ``target`` is the other database,
and whose ``evidence`` records that sampled values were found in the target (e.g.
``"10/10 sampled values found in target"``). A link without measurement evidence is
never guessed — its database is unlinkable, and a criterion sourced from it is routed
to ``not_available`` rather than silently joined (which would mix patients).

The derivation mirrors the bridge logic of
:mod:`core.mapping.build_populate_spec._identity_plan`, but derives from each
database's ``identity_links`` (the indexed cross-database measurement) instead of a
mapping's ``identity.keys``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from core.source_ref import short_alias as _short_alias
from core.source_ref import try_parse_source

# Measurement evidence reads like "10/10 sampled values found in target". A link is
# measured only when the ratio shows a NON-ZERO overlap was sampled in the target —
# so "0/24 …" (sampled, none matched) and any evidence without that ratio are NOT
# measurements. Blank/absent/negative evidence never counts: never guess a join.
_MEASURED_RE = re.compile(
    r"(?P<found>\d+)\s*/\s*\d+\s+sampled values found in target", re.IGNORECASE
)


class CohortBaseError(ValueError):
    """An anchor or database set from which no cohort base can be derived."""


@dataclass(frozen=True)
class CohortBase:
    """The derived cross-database cohort base plus its linkability verdict.

    ``cohort_block`` is the :mod:`core.filters.cohort` block (the anchor table plus
    a measured JOIN per linkable database); ``linkable`` are the other databases
    joined onto the anchor; ``unlinkable`` are those with no measured identity link
    (omitted from the FROM). ``anchor_db`` is the database carrying the anchor
    identity — always usable, never in either set.
    """

    cohort_block: dict[str, Any]
    anchor_db: str
    linkable: set[str]
    unlinkable: set[str]


def _parse(ref: str, what: str) -> tuple[str, str, str]:
    parsed = try_parse_source(ref)
    if parsed is None:
        raise CohortBaseError(f"unparseable {what}: {ref!r}")
    return parsed


def _is_measured(link: dict[str, Any]) -> bool:
    m = _MEASURED_RE.search(str(link.get("evidence") or ""))
    return bool(m) and int(m.group("found")) > 0


def _measured_bridge(
    anchor_model: dict[str, Any], anchor_table: str, target_db: str
) -> tuple[str, str, str] | None:
    """The measured identity link bridging the anchor table to ``target_db``.

    Returns ``(anchor_column, target_table, target_column)`` for the one measured
    ``identity_links`` entry whose ``column`` is on the anchor table and whose
    ``target`` database is ``target_db`` — or ``None`` when none is measured (the
    database is then unlinkable). A bridge column on a different anchor-db table is
    ignored: the cohort FROM joins from the anchor table, so only a link rooted
    there can scope it.

    **Ambiguity is fatal, never guessed.** When the anchor table carries more than
    one measured link to the same target database (e.g. both ``mother_ref`` and
    ``patient_ref`` measured against the same patients table), there is no safe way
    to pick — joining on the wrong one silently mixes patients. This raises
    :class:`CohortBaseError`, mirroring ``build_populate_spec._identity_plan``'s
    single-bridge guard.
    """
    bridges: list[tuple[str, str, str]] = []
    for link in anchor_model.get("identity_links") or []:
        if not _is_measured(link):
            continue
        col = str(link.get("column") or "")
        l_table, _, l_col = col.partition(".")
        if l_table != anchor_table or not l_col:
            continue
        t_db, t_table, t_col = _parse(
            str(link.get("target") or ""), "identity link target"
        )
        if t_db == target_db:
            bridges.append((l_col, t_table, t_col))
    if not bridges:
        return None
    if len(bridges) > 1:
        raise CohortBaseError(
            f"ambiguous identity bridge from {anchor_table!r} to database "
            f"{target_db!r}: {len(bridges)} measured links "
            f"({sorted(b[0] for b in bridges)}) — refusing to guess which scopes "
            f"the cohort (a wrong join would mix patients)"
        )
    return bridges[0]


def derive_cohort_base(
    anchor: str, databases: list[tuple[str, dict[str, Any]]]
) -> CohortBase:
    """Build the cohort base for ``anchor`` across ``databases``.

    ``anchor`` is ``"<db> -> <table>.<column>"`` (the primary identity, one row per
    grain). ``databases`` is ``(db_id, model_json)`` pairs — the anchor database
    plus any others. Every OTHER database with a **measured** identity link to the
    anchor table is JOINed onto it (its quoted, hyphenated slug); a database with no
    measured link is left out and reported as unlinkable. Raises
    :class:`CohortBaseError` if the anchor database's model is absent from
    ``databases``.
    """
    anchor_db, anchor_table, anchor_col = _parse(anchor, "anchor")
    models = {db: model for db, model in databases}
    anchor_model = models.get(anchor_db)
    if anchor_model is None:
        raise CohortBaseError(
            f"anchor database {anchor_db!r} is not among the supplied databases"
        )

    joins: list[str] = []
    linkable: set[str] = set()
    unlinkable: set[str] = set()
    used_aliases = {"b"}
    # Iterate the other databases in a STABLE order (by id), not the caller's list
    # order, so the same anchor + same database set always derives byte-identical
    # JOINs + aliases — the persisted cohort_sql is reproducible and diffable.
    others = sorted({db for db, _ in databases} - {anchor_db})
    for db in others:
        bridge = _measured_bridge(anchor_model, anchor_table, db)
        if bridge is None:
            unlinkable.add(db)
            continue
        anchor_col_b, target_table, target_col = bridge
        alias = _short_alias(target_table, used_aliases)
        # Escape any double-quote in the slug, mirroring the ATTACH in
        # core.filters.cohort, so the quoted identifier can never be broken.
        quoted_db = db.replace('"', '""')
        joins.append(
            f'JOIN "{quoted_db}".{target_table} {alias} '
            f"ON b.{anchor_col_b} = {alias}.{target_col}"
        )
        linkable.add(db)

    from_clause = f"{anchor_table} b"
    if joins:
        from_clause += " " + " ".join(joins)

    cohort_block = {
        "database": anchor_db,
        "from": from_clause,
        "identity_select": f"b.{anchor_col} AS {anchor_col}",
        "identity_keys": [anchor_col],
    }
    return CohortBase(
        cohort_block=cohort_block,
        anchor_db=anchor_db,
        linkable=linkable,
        unlinkable=unlinkable,
    )


def partition_criteria(
    criteria: list[dict[str, Any]], linkable_dbs: set[str], anchor_db: str
) -> tuple[list[dict[str, Any]], list[tuple[dict[str, Any], str]]]:
    """Split criteria into ``(usable, not_available)`` by source-database linkability.

    A criterion on the anchor database or any linkable database is usable; a
    criterion on a database with no measured identity link to the anchor is routed
    to ``not_available`` paired with the reason — NEVER silently joined. (This
    complements the free-text "not available" the grounding engine already
    produces.)
    """
    usable: list[dict[str, Any]] = []
    not_available: list[tuple[dict[str, Any], str]] = []
    for criterion in criteria:
        # A malformed source is the strongest "not available" case — route it, never
        # let one bad criterion abort the whole partition.
        try:
            db, _, _ = _parse(str(criterion.get("source") or ""), "criterion source")
        except CohortBaseError as exc:
            not_available.append((criterion, str(exc)))
            continue
        if db == anchor_db or db in linkable_dbs:
            usable.append(criterion)
        else:
            not_available.append(
                (
                    criterion,
                    f"database {db!r} has no measured identity link to the cohort",
                )
            )
    return usable, not_available
