"""The navigable-collection seam — one abstraction the navigation verbs share.

`navigation.md` / [ADR 0005](../../../../specs/product/decisions/0005-navigation-is-a-generic-verb-set-over-collections.md)
make navigation a generic verb-set — ``catalog`` (``ls``), ``search`` (``grep``),
``describe`` (``cat``) — over a named **collection** of described items. A
collection knows how to *list* its items, *grep* them by keyword, and *describe*
one node; the verbs select a collection and delegate, carrying **no**
collection-specific logic of their own.

Three collections are registered today — ``databases`` (the bound clinical
databases), ``datasets`` (the saved Datasets, each a ``dataset.json``), and
``templates`` (the saved table templates, each a ``spec.json``). Adding a
collection means implementing the ``Collection`` interface and registering it
here — nothing in the tools changes.

``join-paths`` is **not** here: only the clinical database carries a measured join
graph, so following edges is a databases-only verb, not a collection-generic one.
"""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from _collection_databases import DatabasesCollection
from _collection_datasets import DatasetsCollection
from _collection_templates import TemplatesCollection
from _common import ToolError


class Collection(Protocol):
    """One navigable collection: ``catalog`` / ``search`` / ``describe`` over it.

    Each method returns the verb's full success payload **minus** the ``ok``
    flag (the tool wrapper adds ``{"ok": true}``), and raises ``ToolError`` for an
    actionable failure (an unknown node, a malformed model) so the agent gets the
    ``{"ok": false, "error": …}`` + exit-2 contract. Implementing these three is
    all it takes to add a collection.
    """

    name: str

    def catalog(self, cwd: Path) -> dict:
        """``ls`` — list the collection's items, each a shallow one-line summary."""
        ...

    def search(self, cwd: Path, query: str) -> dict:
        """``grep`` — the keyword matches across the collection's items."""
        ...

    def describe(self, cwd: Path, request: dict) -> dict:
        """``cat`` — read one node of the collection in full."""
        ...


def resolve_collection(name: str | None) -> Collection:
    """The collection named ``name`` (default ``databases``).

    A missing/empty ``collection`` arg means ``databases`` — so the default
    surface is unchanged. ``datasets`` and ``templates`` are the other registered
    collections. An unknown name is an actionable ``ToolError`` (→ exit 2) listing
    the valid collections, never a silent success that ignores the bad argument.
    """
    if name is None or not name.strip():
        name = _DEFAULT_COLLECTION
    collection = _REGISTRY.get(name.strip())
    if collection is None:
        valid = sorted(_REGISTRY)
        raise ToolError(
            f"no collection {name.strip()!r}. The collections you can navigate "
            f"are: {valid}."
        )
    return collection


# --- the registry: name -> Collection. Adding a collection registers it here. -

_DEFAULT_COLLECTION = "databases"

_REGISTRY: dict[str, Collection] = {
    DatabasesCollection.name: DatabasesCollection(),
    DatasetsCollection.name: DatasetsCollection(),
    TemplatesCollection.name: TemplatesCollection(),
}
