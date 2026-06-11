from __future__ import annotations

import json
import subprocess
import sys
import uuid
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / ".opencode" / "tools" / "notes.py"
RUN_ID = f"notes-smoke-{uuid.uuid4().hex[:8]}"


def call(request: dict[str, object]) -> dict[str, object]:
    completed = subprocess.run(
        [sys.executable, str(SCRIPT), json.dumps(request)],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def main() -> None:
    note = {
        "kind": "data",
        "description": "Rows extracted for workbook population.",
        "sqlCall": {
            "tool": "sql_execute",
            "sql": "SELECT patient_id, description FROM medications LIMIT 100",
        },
        "data": {
            "columns": ["patient_id", "description"],
            "rows": [["case-001", "Amoxicillin 500 MG"]],
        },
    }

    write_response = call({"action": "write", "runId": RUN_ID, "note": note})
    assert write_response["ok"] is True, write_response
    note_id = write_response["noteId"]
    assert note_id == "note-000001", write_response

    note_path = ROOT / "tmp" / "runs" / RUN_ID / "notes" / "evidence.jsonl"
    assert note_path.exists(), note_path

    by_id = call({"action": "read", "runId": RUN_ID, "noteIds": [note_id]})
    assert by_id["ok"] is True, by_id
    assert by_id["notes"][0]["noteId"] == note_id, by_id
    assert by_id["notes"][0]["note"] == note, by_id

    by_offset = call({"action": "read", "runId": RUN_ID, "offset": 0, "limit": 1})
    assert by_offset["ok"] is True, by_offset
    assert len(by_offset["notes"]) == 1, by_offset
    assert by_offset["total"] == 1, by_offset

    bad_run = call({"action": "read", "runId": "../outside", "offset": 0, "limit": 1})
    assert bad_run["ok"] is False, bad_run
    assert "runId" in bad_run["error"], bad_run

    missing_note = call({"action": "write", "runId": RUN_ID})
    assert missing_note["ok"] is False, missing_note
    assert "note" in missing_note["error"], missing_note

    non_object_note = call({"action": "write", "runId": RUN_ID, "note": "plain text"})
    assert non_object_note["ok"] is False, non_object_note
    assert "note" in non_object_note["error"], non_object_note

    print("notes_smoke passed")


if __name__ == "__main__":
    main()
