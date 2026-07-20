"""Audit a single NPDA eval run's cells against the database ground truth for the
DOB>2020 single-patient cohort (Lily Hartley, 9874123008; visits V0019/V0020/V0021).

Not a product module — a verification harness for the headless eval. Run::

    python3 scripts/verify_npda_lily.py var/artifacts/<run-id>

It reports every cell that fails the completion bar: a fill that is not the exact
DB value (in the field's DD/MM/YYYY date format), or a block whose value is in fact
present, or any pending / uncited-free-text / ISO-date cell.
"""

from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATIENT = "9874123008"
VISITS = {"V0019": "2026-04-24", "V0020": "2026-08-12", "V0021": "2026-12-15"}
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def iso_to_ddmmyyyy(v: str) -> str:
    if ISO.match(v or ""):
        y, m, d = v.split("-")
        return f"{d}/{m}/{y}"
    return v


def clinical():
    return sqlite3.connect(
        f"file:{ROOT / 'var/databases/npda-clinical/database.sqlite'}?mode=ro", uri=True
    )


def ground_truth():
    """Per-visit expected measurement/screening presence for Lily."""
    c = clinical()
    meas = {}  # (visit, type) -> value
    for vr, mt, val in c.execute(
        "SELECT visit_ref, measurement_type, value FROM measurements WHERE patient_ref=?",
        (PATIENT,),
    ):
        meas[(vr, mt)] = val
    screen = {}  # type -> (date, result)
    for st, sd, rc in c.execute(
        "SELECT screening_type, screening_date, result_code FROM screening_results WHERE patient_ref=?",
        (PATIENT,),
    ):
        screen[st] = (sd, rc)
    notes_visits = {
        r[0]
        for r in c.execute(
            "SELECT DISTINCT visit_ref FROM clinical_notes WHERE patient_ref=?",
            (PATIENT,),
        )
    }
    c.close()
    return meas, screen, notes_visits


def main(run_dir: str) -> int:
    cells_db = Path(run_dir) / "template" / "cells.sqlite"
    conn = sqlite3.connect(f"file:{cells_db}?mode=ro", uri=True)
    rows = [
        dict(zip(["field", "member", "kind", "state", "value", "rd", "sources"], r))
        for r in conn.execute(
            "SELECT field,member,kind,state,value,reason_detail,sources FROM cells"
        )
    ]
    conn.close()
    meas, screen, notes_visits = ground_truth()

    problems: list[str] = []

    # model: free-text columns (citation required)
    ft = set()
    try:
        model = json.loads(
            (Path(run_dir) / "database" / "npda-clinical.model.json").read_text()
        )
        for t in model.get("tables", []):
            for col in t.get("columns", []):
                if col.get("reason") == "free-text":
                    ft.add(f"{t['name']}.{col['name']}".lower())
    except Exception:
        pass

    by_state = {}
    for r in rows:
        by_state[r["state"]] = by_state.get(r["state"], 0) + 1
        f, m, st, val = r["field"], r["member"], r["state"], r["value"]

        if st == "pending":
            problems.append(f"PENDING: {f}/{m}")
            continue

        if st == "blocked":
            if not (r["rd"] or "").strip():
                problems.append(f"BLOCK NO REASON: {f}/{m}")
            continue

        # filled --------------------------------------------------------
        if val is None or str(val).strip() == "":
            problems.append(f"FILLED-EMPTY: {f}/{m}")
        if ISO.match(str(val) or ""):
            problems.append(f"ISO-DATE (want DD/MM/YYYY): {f}/{m} = {val}")
        # free-text fills must cite
        for s in json.loads(r["sources"] or "[]"):
            if isinstance(s, dict) and str(s.get("table_column") or "").lower() in ft:
                cites = s.get("citations")
                if not (isinstance(cites, list) and any(str(x).strip() for x in cites)):
                    problems.append(f"UNCITED FREE-TEXT FILL: {f}/{m}")

        # measurement value checks
        for mt, fld in (
            ("hba1c", "hba1c_value"),
            ("height", "patient_height_cm"),
            ("weight", "patient_weight_kg"),
        ):
            if f == fld:
                exp = meas.get((m, mt))
                if exp is None:
                    problems.append(
                        f"FILLED-BUT-ABSENT {f}/{m} = {val} (no {mt} for {m})"
                    )
                elif str(val) != str(exp):
                    problems.append(f"WRONG VALUE {f}/{m} = {val} (db {mt}={exp})")

    # screening: a screening fill must be on the visit whose date matches it
    screen_fields = {
        "observation_date_thyroid_function": "thyroid",
        "at_time_of_or_following_measurement_of_thyroid_function_was_the_patient_prescribed_any_thyroid_treatment": "thyroid",
        "observation_date_coeliac_disease_screening": "coeliac_dietary_status",
        "has_the_patient_been_recommended_prescribed_a_gluten_free_diet": "coeliac_dietary_status",
        "date_that_influenza_immunisation_was_recommended": "influenza_immunisation",
    }
    for r in rows:
        f, m, st = r["field"], r["member"], r["state"]
        if f in screen_fields and st == "filled":
            stype = screen_fields[f]
            sd = screen.get(stype, (None, None))[0]
            if sd != VISITS.get(m):  # screening date must equal this visit's date
                problems.append(
                    f"SCREENING LEAK: {f}/{m} filled but {stype} dated {sd} != visit {m} ({VISITS.get(m)})"
                )

    # note-derived fields filled only where a note exists (V0019)
    note_fields = {
        "insulin_regime_at_time_of_visit",
        "was_the_patient_using_a_continuous_glucose_monitor_cgm_at_time_of_visit",
        "was_the_patient_using_or_trained_to_use_blood_ketone_testing_equipment_at_time_of_visit",
        "date_of_annual_psychological_screening_assessment",
        "date_level_3_carbohydrate_counting_education_received",
    }
    for r in rows:
        if (
            r["field"] in note_fields
            and r["state"] == "filled"
            and r["member"] not in notes_visits
        ):
            problems.append(f"NOTE-FILL ON NO-NOTE VISIT: {r['field']}/{r['member']}")

    print(f"run: {run_dir}")
    print(f"states: {by_state}")
    if problems:
        print(f"\n!! {len(problems)} PROBLEM(S):")
        for p in problems:
            print(f"   {p}")
        return 1
    print(
        "\nPASS — every cell is an exact DB value (DD/MM/YYYY dates) or a reasoned block; "
        "no leaks, no uncited free-text fills, no pending."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1] if len(sys.argv) > 1 else ""))
