"""
Create CSV and XLSX tables from extracted JSON.

Usage: python create_workbook_from_json.py <input.json> <output.xlsx> [output.csv]
Usage: python create_workbook_from_json.py --json_path <input.json> --output_xlsx_path <output.xlsx> [--output_csv_path <output.csv>]
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

from openpyxl import Workbook


def table_items(data: object, prefix: str = "") -> list[tuple[str, list[list[object]]]]:
    if isinstance(data, dict):
        tables = []
        for key, value in data.items():
            if isinstance(value, list) and value and all(isinstance(row, list) for row in value):
                tables.append((prefix + key, value))
            elif isinstance(value, dict):
                tables.extend(table_items(value, prefix=f"{prefix}{key}_"))
        if tables:
            return tables

    if isinstance(data, dict) and "pages" in data:
        rows = [["Page", "Text"]]
        for page in data.get("pages", []):
            if isinstance(page, dict):
                rows.append([page.get("page", ""), page.get("text", "")])
        return [("extracted_text", rows)]

    if isinstance(data, dict):
        return [("fields", [["Field", "Value"], *[[key, value] for key, value in data.items()]])]

    return [("data", [["Value"], [data]])]


def main() -> None:
    args = sys.argv[1:]
    if "--json_path" in args:
        parser = argparse.ArgumentParser(description="Create CSV and XLSX tables from extracted JSON.")
        parser.add_argument("--json_path", required=True)
        parser.add_argument("--output_xlsx_path", required=True)
        parser.add_argument("--output_csv_path")
        parser.add_argument("--out_dir")
        parsed = parser.parse_args(args)
        input_path = Path(parsed.json_path)
        xlsx_path = Path(parsed.output_xlsx_path)
        csv_path = Path(parsed.output_csv_path) if parsed.output_csv_path else xlsx_path.with_suffix(".csv")
    else:
        if len(args) not in {2, 3}:
            print("Usage: create_workbook_from_json.py <input.json> <output.xlsx> [output.csv]")
            print("Usage: create_workbook_from_json.py --json_path <input.json> --output_xlsx_path <output.xlsx> [--output_csv_path <output.csv>]")
            sys.exit(1)
        input_path = Path(args[0])
        xlsx_path = Path(args[1])
        csv_path = Path(args[2]) if len(args) == 3 else xlsx_path.with_suffix(".csv")

    data = json.loads(input_path.read_text(encoding="utf-8"))
    tables = table_items(data)

    xlsx_path.parent.mkdir(parents=True, exist_ok=True)
    csv_path.parent.mkdir(parents=True, exist_ok=True)

    wb = Workbook()
    wb.remove(wb.active)
    for name, rows in tables:
        ws = wb.create_sheet(title=str(name)[:31] or "Sheet")
        for row in rows:
            ws.append(row)
    wb.save(xlsx_path)

    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        for name, rows in tables:
            writer.writerow([name])
            writer.writerows(rows)
            writer.writerow([])

    print(f"Wrote {xlsx_path}")
    print(f"Wrote {csv_path}")


if __name__ == "__main__":
    main()
