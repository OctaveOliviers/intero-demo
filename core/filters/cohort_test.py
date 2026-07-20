"""The read-only cohort resolver: compose grounded predicates -> COUNT.

Composition (predicates AND'd into the cohort block) is a pure string transform;
the COUNT is proved against the **seeded cord-pH fixture** (run ``make db seed``
first). These counts are deterministic goldens — no LLM, no network.

Run: ``python3 -m core.filters.cohort_test``
"""

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from core.config import DATABASES_DIR  # noqa: E402
from core.filters.cohort import compose_cohort, count_cohort  # noqa: E402
from core.filters.cohort import (  # noqa: E402
    cohort_from_aliases,
    resolve_cohort,
    resolve_runtime_filter_predicates,
    validate_executable_cohort,
)

# The cord-pH cohort base (mirrors var/templates/cord-ph/mapping.json executable.cohort).
COHORT = {
    "database": "cord-ph",
    "from": (
        "cord_ph_birth_records b "
        "LEFT JOIN nicu_admissions n ON b.patient_code = n.patient_code"
    ),
    "identity_select": "b.patient_code AS patient_code",
    "identity_keys": ["patient_code"],
}


def _crit(source, ftype, op, value):
    return {"source": source, "type": ftype, "predicate": {"op": op, "value": value}}


LATE_ROW = _crit("cord-ph -> cord_ph_birth_records._row_id", "number", ">=", 9)
NICU = _crit(
    "cord-ph -> nicu_admissions.source_system",
    "category",
    "=",
    "Northbank Neonatal EHR",
)
SELECTED_PATIENTS = _crit(
    "cord-ph -> cord_ph_birth_records.patient_code",
    "category",
    "in",
    ["CPH002", "CPH004"],
)


def _db_paths():
    return {"cord-ph": DATABASES_DIR / "cord-ph" / "database.sqlite"}


class ComposeTest(unittest.TestCase):
    def test_predicates_and_into_the_cohort_block(self):
        sql, params = compose_cohort(COHORT, [LATE_ROW, NICU])
        self.assertIn("SELECT DISTINCT b.patient_code AS patient_code", sql)
        self.assertIn("FROM cord_ph_birth_records b", sql)
        # Each grounded predicate is ANDed in, alias-qualified, and parameterised.
        self.assertIn("(CAST(b._row_id AS REAL) >= :c0)", sql)
        self.assertIn("(n.source_system = :c1)", sql)
        self.assertIn(" AND ", sql)
        self.assertEqual(params, {"c0": 9, "c1": "Northbank Neonatal EHR"})

    def test_no_criteria_is_the_whole_cohort(self):
        sql, params = compose_cohort(COHORT, [])
        self.assertNotIn("WHERE", sql)
        self.assertEqual(params, {})

    def test_unknown_table_for_cohort_from_is_rejected(self):
        bad = _crit("cord-ph -> nowhere.col", "category", "=", "x")
        with self.assertRaises(ValueError):
            compose_cohort(COHORT, [bad])


class CountTest(unittest.TestCase):
    """Golden COUNTs on the seeded cord-pH fixture (10 birth records)."""

    def test_empty_cohort_counts_every_member(self):
        self.assertEqual(count_cohort(_db_paths(), COHORT, []), 10)

    def test_single_number_predicate(self):
        self.assertEqual(count_cohort(_db_paths(), COHORT, [LATE_ROW]), 2)

    def test_single_category_predicate(self):
        self.assertEqual(count_cohort(_db_paths(), COHORT, [NICU]), 4)

    def test_in_list_predicate(self):
        self.assertEqual(count_cohort(_db_paths(), COHORT, [SELECTED_PATIENTS]), 2)

    def test_predicates_compose_to_intersection(self):
        self.assertEqual(count_cohort(_db_paths(), COHORT, [LATE_ROW, NICU]), 1)

    def test_count_is_read_only(self):
        # A criterion never lets a write reach the clinical DB: the resolver runs on
        # a read-only connection. Counting twice yields the same value, untouched.
        self.assertEqual(count_cohort(_db_paths(), COHORT, [NICU]), 4)
        self.assertEqual(count_cohort(_db_paths(), COHORT, [NICU]), 4)


# --- cross-database (ATTACH + identity bridge) ---------------------------------
# A Dataset over npda-clinical (anchored on clinic_visits.visit_id) with a filter
# on the npda-demographics database, joined on the measured identity bridge
# (clinic_visits.patient_ref = patients.nhs_number). The hyphenated slug is quoted.
NPDA_COHORT = {
    "database": "npda-clinical",
    "from": (
        'clinic_visits b JOIN "npda-demographics".patients pt '
        "ON b.patient_ref = pt.nhs_number"
    ),
    "identity_select": "b.visit_id AS visit_id",
    "identity_keys": ["visit_id"],
}
SEX_FEMALE = _crit("npda-demographics -> patients.sex", "category", "=", "Female")
SEX_MALE = _crit("npda-demographics -> patients.sex", "category", "=", "Male")


def _npda_paths():
    return {
        "npda-clinical": DATABASES_DIR / "npda-clinical" / "database.sqlite",
        "npda-demographics": DATABASES_DIR / "npda-demographics" / "database.sqlite",
    }


class CrossDatabaseTest(unittest.TestCase):
    def test_attached_db_predicate_resolves_to_its_alias(self):
        # The quoted, hyphenated attached slug must qualify to the FROM's alias.
        sql, params = compose_cohort(NPDA_COHORT, [SEX_FEMALE])
        self.assertIn("(pt.sex = :c0)", sql)
        self.assertEqual(params, {"c0": "Female"})

    def test_count_spans_both_databases_via_attach(self):
        self.assertEqual(count_cohort(_npda_paths(), NPDA_COHORT, []), 26)
        self.assertEqual(count_cohort(_npda_paths(), NPDA_COHORT, [SEX_FEMALE]), 15)
        self.assertEqual(count_cohort(_npda_paths(), NPDA_COHORT, [SEX_MALE]), 11)


# --- the executable's cohort block (table-population runtime grammar) ----------
# These functions moved verbatim from server/routes/table_populations.py so the
# cohort SQL grammar has ONE owner; the tests pin the moved semantics bit-for-bit.

# A mapping.json extract shaped like the audit artifacts the route reads.
MAPPING_DOC = {
    "criteria_bindings": [
        {
            "criterion_id": "delivery",
            "label": "Mode of delivery",
            "source": "cord-ph -> cord_ph_birth_records.delivery",
            "type": "category",
        },
        {
            "criterion_id": "gestation_weeks",
            "label": "Gestation (completed weeks)",
            "source": "cord-ph -> cord_ph_birth_records.gestation_weeks",
            "type": "number",
        },
        {
            "criterion_id": "admission_date",
            "label": "NICU admission date",
            "source": "cord-ph -> nicu_admissions.admitted_on",
            "type": "date",
        },
        {
            "criterion_id": "off_cohort_table",
            "label": "Not joined into the cohort",
            "source": "cord-ph -> transfers.ward",
            "type": "category",
        },
    ]
}


class CohortFromAliasesTest(unittest.TestCase):
    """Alias extraction over the FROM shapes build_populate_spec._build_cohort emits."""

    def test_single_anchor_table(self):
        # The minimal compiled cohort: just the aliased anchor table.
        self.assertEqual(
            cohort_from_aliases("cord_ph_birth_records b"),
            {"cord_ph_birth_records": "b"},
        )

    def test_anchor_plus_join_clauses(self):
        from_clause = (
            "cord_ph_birth_records b "
            "JOIN nicu_admissions n ON b.patient_code = n.patient_code "
            "JOIN encounters e ON b.encounter = e.id"
        )
        self.assertEqual(
            cohort_from_aliases(from_clause),
            {
                "cord_ph_birth_records": "b",
                "nicu_admissions": "n",
                "encounters": "e",
            },
        )

    def test_left_join_is_read_like_a_join(self):
        self.assertEqual(
            cohort_from_aliases(COHORT["from"]),
            {"cord_ph_birth_records": "b", "nicu_admissions": "n"},
        )

    def test_bare_table_aliases_to_itself(self):
        self.assertEqual(
            cohort_from_aliases("cord_ph_birth_records"),
            {"cord_ph_birth_records": "cord_ph_birth_records"},
        )


class ResolveRuntimeFilterPredicatesTest(unittest.TestCase):
    """A run request's filters dict -> the exact WHERE terms + binds as before the move."""

    def _resolve(self, filters):
        return resolve_runtime_filter_predicates(
            filters,
            MAPPING_DOC,
            database_id="cord-ph",
            cohort_from=COHORT["from"],
        )

    def test_no_filters_is_a_noop(self):
        self.assertEqual(self._resolve({}), ([], {}))

    def test_database_key_is_skipped(self):
        self.assertEqual(self._resolve({"database": "cord-ph"}), ([], {}))

    def test_category_number_and_date_produce_the_same_where(self):
        where_terms, params = self._resolve(
            {
                "gestation_weeks": ">= 34 weeks",
                "delivery": "Caesarean, Ventouse",
                "admission_date": "since 2024-01-01",
            }
        )
        # Exact SQL text, alias-qualified against the cohort FROM, in filter order.
        self.assertEqual(
            where_terms,
            [
                "b.gestation_weeks >= :f0",
                "b.delivery IN (:f1_0, :f1_1)",
                "n.admitted_on >= :f2",
            ],
        )
        self.assertEqual(
            params,
            {
                "f0": 34.0,
                "f1_0": "Caesarean",
                "f1_1": "Ventouse",
                "f2": "2024-01-01",
            },
        )

    def test_number_range_becomes_between(self):
        where_terms, params = self._resolve({"gestation_weeks": "34 to 37"})
        self.assertEqual(where_terms, ["b.gestation_weeks BETWEEN :f0_lo AND :f0_hi"])
        self.assertEqual(params, {"f0_lo": 34.0, "f0_hi": 37.0})

    def test_date_key_suffix_sets_the_comparator(self):
        where_terms, params = self._resolve(
            {"admission_date_from": "2024-01-01", "admission_date_to": "2024-12-31"}
        )
        self.assertEqual(where_terms, ["n.admitted_on >= :f0", "n.admitted_on <= :f1"])
        self.assertEqual(params, {"f0": "2024-01-01", "f1": "2024-12-31"})

    def test_no_bindings_on_the_database_raises(self):
        with self.assertRaises(ValueError) as ctx:
            resolve_runtime_filter_predicates(
                {"delivery": "Caesarean"},
                MAPPING_DOC,
                database_id="other-db",
                cohort_from=COHORT["from"],
            )
        self.assertIn("no criteria bindings", str(ctx.exception))

    def test_unresolved_filter_key_raises(self):
        with self.assertRaises(ValueError) as ctx:
            self._resolve({"smoking_status": "Never"})
        self.assertIn("no unique criteria binding", str(ctx.exception))

    def test_source_table_missing_from_cohort_from_raises(self):
        # `transfers` is bound in the mapping but not joined into the cohort FROM.
        with self.assertRaises(ValueError) as ctx:
            self._resolve({"off_cohort_table": "Postnatal"})
        self.assertIn("is not in cohort.from", str(ctx.exception))


def _executable(identity_keys=("patient_code",)):
    executable = {
        "cohort": {
            "database": "cord-ph",
            "from": COHORT["from"],
            "identity_select": COHORT["identity_select"],
            "where": [],
        }
    }
    if identity_keys is not None:
        executable["identity_keys"] = list(identity_keys)
    return executable


class ValidateExecutableCohortTest(unittest.TestCase):
    """The runtime's cohort-block validation, message-for-message."""

    def test_missing_cohort_block(self):
        with self.assertRaises(ValueError) as ctx:
            validate_executable_cohort({}, _db_paths())
        self.assertEqual(str(ctx.exception), "executable.cohort is missing")

    def test_missing_database(self):
        with self.assertRaises(ValueError) as ctx:
            validate_executable_cohort({"cohort": {}}, _db_paths())
        self.assertEqual(str(ctx.exception), "executable.cohort.database is missing")

    def test_missing_database_path(self):
        executable = _executable()
        with self.assertRaises(ValueError) as ctx:
            validate_executable_cohort(executable, {})
        self.assertEqual(
            str(ctx.exception),
            "no database path supplied for cohort database 'cord-ph'",
        )

    def test_incomplete_identity_select_or_from(self):
        for missing in ("identity_select", "from"):
            executable = _executable()
            executable["cohort"][missing] = ""
            with self.assertRaises(ValueError) as ctx:
                validate_executable_cohort(executable, _db_paths())
            self.assertEqual(
                str(ctx.exception),
                "executable.cohort is incomplete (identity_select/from)",
            )

    def test_valid_block_returns_its_pieces(self):
        cohort_spec, db_path, identity_select, from_clause = validate_executable_cohort(
            _executable(), _db_paths()
        )
        self.assertEqual(cohort_spec["database"], "cord-ph")
        self.assertEqual(db_path, _db_paths()["cord-ph"])
        self.assertEqual(identity_select, COHORT["identity_select"])
        self.assertEqual(from_clause, COHORT["from"])


class ResolveCohortTest(unittest.TestCase):
    """resolve_cohort on the seeded cord-pH fixture (mirrors the COUNT goldens)."""

    def test_resolves_every_identifiable_member(self):
        cohort = resolve_cohort(_executable(), _db_paths())
        self.assertEqual(len(cohort), 10)
        self.assertEqual(len(set(cohort)), 10)

    def test_runtime_where_scopes_the_cohort(self):
        # The same slice LATE_ROW counts to 2 in the CountTest goldens.
        cohort = resolve_cohort(
            _executable(),
            _db_paths(),
            runtime_where=["CAST(b._row_id AS REAL) >= :f0"],
            runtime_params={"f0": 9.0},
        )
        self.assertEqual(len(cohort), 2)

    def test_missing_identity_keys_raises(self):
        with self.assertRaises(ValueError) as ctx:
            resolve_cohort(_executable(identity_keys=None), _db_paths())
        self.assertEqual(str(ctx.exception), "executable.identity_keys is missing")


class ReadOnlyGuardTest(unittest.TestCase):
    """The cohort resolver now shares the table-population read-only connection
    (``readonly_connection(main, attach=…)``). This pins that the shared guard still
    refuses writes and ATTACH/DETACH from query SQL on the connection cohort uses."""

    def test_shared_connection_blocks_write(self):
        import sqlite3

        from core import table_population

        conn = table_population.readonly_connection(_db_paths()["cord-ph"])
        self.addCleanup(conn.close)
        with conn, self.assertRaises(sqlite3.OperationalError):
            conn.execute("INSERT INTO cord_ph_birth_records(patient_code) VALUES ('X')")

    def test_shared_connection_blocks_attach_from_query(self):
        import sqlite3

        from core import table_population

        # ATTACH performed by the module (as attach=) is fine; ATTACH issued as
        # query SQL after the authorizer is installed is denied.
        conn = table_population.readonly_connection(
            _npda_paths()["npda-clinical"],
            {"npda-demographics": _npda_paths()["npda-demographics"]},
        )
        self.addCleanup(conn.close)
        with conn:
            conn.execute("SELECT 1 FROM patients LIMIT 1").fetchone()
            with self.assertRaises(sqlite3.DatabaseError):
                conn.execute('ATTACH DATABASE ":memory:" AS evil')


if __name__ == "__main__":
    unittest.main()
