---
name: evidence
description: Build the traceable source behind a value — the exact query + record (structured) or the verbatim note passages (free text). Every value you record or cite carries one. Use when recording a cell value or citing a chat claim.
metadata:
  boundary: cite-source
---

# Evidence

Every value you **record** (a cell) or **claim** (a chat answer) carries a
**source** that re-extracts it next to the entity's identity. Same shape for
both — only the sink differs.

## The source object
`{"database":"<name>", "query":"<sql>", "table_column":"<table.column>"}`

For a value read from **free text** (a note/comment), add:
`"row_id":"<the record's primary key>", "row_key":"<the column that key is in>", "citations":["<verbatim substring>", ...]`

- `query` must project the **entity identity** beside the value, so the source verifies on its own.
- Several sources per value is fine — **one object per record**; one record can carry several citations.

## Rules (enforced at the sink — a bad source is rejected)
- **≥1 source.** A recorded/cited value with no source is rejected.
- **Verbatim citations for free text.** A value judged from a note quotes **exact substrings** of
  that note — never a paraphrase. A missing or non-substring citation is rejected.
- **No inference from absence.** "The note doesn't mention X, so X is No" is not evidence — there is
  no value to record (block the cell / don't make the claim).
- **Real records only.** Cite a value the record actually holds — a structured column's value, or a
  note's own words. Never fabricate, never default.

## Sinks (same source, different destination)
- **table-fill** → the source(s) go in the cell's `sources` array, written with the value in one `UPDATE`.
- **chat-answer** → the source becomes an inline citation that opens the evidence panel.

## What this skill does NOT do
- Find where data lives — that's the **navigate** skill.
- Decide the value — that's the caller (table-fill / chat-answer).
