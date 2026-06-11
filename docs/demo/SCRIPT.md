# Intero — 2-minute demo script

> Target runtime: ~2:00. Read at a calm, natural pace.
> Stage directions in *italics*. Spoken lines in plain text.
> No hyphens in the spoken lines — they're hard to read aloud.

---

## 0:00 — Open on the home screen

Ask any clinical question, and Intero finds the answer. It searches databases, notes, PDFs and images to generate structured outputs such as completed audit and reports. Of course, every data point links back to its source, and since the language model powering the agent runs locally, sensitive patient data never leaves the hospital.

## 0:20 — Upload a template *(Flow A)*

*Click "Upload template", pick the .xlsx.*

We'll start by uploading an Excel template for an audit our clinicians run at birth, namely tracking the pH levels of the umbilical cord, which is a key indicator of newborn health.

*Card appears with the "Indexing…" badge.*

The moment it's uploaded, Intero indexes the template. What that means is the agent is building a mental model of this audit: what question it's really asking, what each column expects, what level of detail is required for every field. And that matters because every time we want to run this same audit later, on a different period, a different hospital, or a different cohort of patients, the agent already understands the audit and can reuse that exact same understanding.

## 0:42 — Open and configure

*Card flips to "Ready". Click it. Card expands. Database shows the EHR database.*

Once it's ready, we open it. We can add filters here if we want, namely a specific period, or one particular hospital. And for the data source, out of all the hospital's databases, we're selecting our electronic health records, the EHR. Importantly, the agent has read only access to this database, so it can pull data, but it cannot write, update, or delete anything. So there is zero risk of a hallucination ever ending up in a patient record.

## 1:05 — Start the analysis

*Click "Run analysis".*

As soon as we start the analysis, the agent gets to work.

## 1:10 — Following along in real time

*Activity card streams headlines.*

We can follow along in real time with what the agent is thinking, the tools it's calling, the database it's querying, the notes it's reading.

*File chip appears within ~2s. Click it. Spreadsheet opens, cells flash in.*

And the moment it creates the spreadsheet, we can open it and follow its progress there too, watching the template populate, column by column, cell by cell.

## 1:30 — Traceability: direct value

*Click a direct cell. Right panel slides in.*

We don't have to wait for the agent to finish before we start verifying the work. We can immediately verify the source of every single value. We click any cell, and here is exactly how it was derived: the explanation, the SQL query the agent ran, and the structured row it pulled the value from.

## 1:47 — Traceability: interpretive value

*Click an interpretive cell — notes render with highlights.*

For values the agent had to interpret, it's even richer. Here it combined the obstetrician's birth summary with the midwife's delivery note, and the exact passages it relied on are highlighted, right inside the full clinical note.

## 2:00 — Flow B: describe the data

*Back to home. Paste an email into "Describe the data you want". Click "Run analysis".*

And we don't even need a template to begin with. We can paste a doctor's email describing the data they want, and Intero builds the spreadsheet from scratch, then fills it the same way, fully traceable.

## 2:10 — Close

That's Intero. Clinical analysis that shows its work.
