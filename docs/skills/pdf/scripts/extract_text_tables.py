"""
Extract text and tables from a PDF into JSON.

Usage: python extract_text_tables.py <input.pdf> <output.json> [max_pages]
If <output.json> is a directory, extracted.json is written inside it.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pdfplumber


def resolve_output_path(path: Path) -> Path:
    if path.exists() and path.is_dir():
        return path / "extracted.json"
    if path.suffix.lower() != ".json":
        return path / "extracted.json"
    return path


def parse_max_pages(value: str | None) -> int | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized in {"", "none", "null", "all"}:
        return None
    return int(value)


def extract_text_tables(pdf_path: str, max_pages: int | None = None) -> dict:
    result = {"pages": []}
    with pdfplumber.open(pdf_path) as pdf:
        pages = pdf.pages[:max_pages] if max_pages else pdf.pages
        for index, page in enumerate(pages, start=1):
            result["pages"].append(
                {
                    "page": index,
                    "text": page.extract_text() or "",
                    "tables": page.extract_tables() or [],
                }
            )
    return result


def main() -> None:
    args = sys.argv[1:]
    if "--pdf_path" in args:
        pdf_path = args[args.index("--pdf_path") + 1]
        output_path = resolve_output_path(Path(args[args.index("--output_json") + 1]))
        max_pages = parse_max_pages(args[args.index("--max_pages") + 1]) if "--max_pages" in args else None
    else:
        if len(args) not in {2, 3}:
            print("Usage: extract_text_tables.py <input.pdf> <output.json> [max_pages]")
            print("Usage: extract_text_tables.py --pdf_path <input.pdf> --output_json <output.json> [--max_pages n]")
            sys.exit(1)
        pdf_path = args[0]
        output_path = resolve_output_path(Path(args[1]))
        max_pages = parse_max_pages(args[2]) if len(args) == 3 else None

    output_path.parent.mkdir(parents=True, exist_ok=True)
    extracted = extract_text_tables(pdf_path, max_pages=max_pages)
    output_path.write_text(json.dumps(extracted, indent=2), encoding="utf-8")
    print(f"Wrote {len(extracted['pages'])} pages to {output_path}")
    print(json.dumps(extracted))


if __name__ == "__main__":
    main()
