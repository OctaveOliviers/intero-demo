# Intero — Frontend

Svelte 4 + Vite 5 browser UI.

## Stack

- **Svelte 4** — framework
- **Vite 5** — dev server + build (outDir: `static/`)
- **JSpreadsheet CE** — spreadsheet grids
- **SheetJS (`xlsx`)** — workbook parsing

## Dev

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173`, proxies `/api/*` to `http://127.0.0.1:8000`.
If another worktree already owns those ports, set this worktree's ports once in
`../.env`:

```bash
INTERO_SERVER_PORT=8001
INTERO_APP_PORT=5174
```

Then keep using `make dev` for the backend and `npm run dev` for the frontend.

## Production Build

```bash
npm run build          # outputs to app/static/
python3 -m server      # serves everything on :8000
```

## Home Run Mode Contract

- `npm run dev` (real mode):
  - Home templates and parsing resolve against backend catalogs from `/api/audits`.
  - Home database selection resolves against backend catalogs from `/api/databases`.
  - Home run payloads use backend audit IDs only.
  - Home prompt-run omits `database` when no valid backend database ID is selected, so backend default DB resolution applies.
- `npm run dev:mock` (mock mode):
  - Home keeps static/mock template and database catalog behavior.
  - Existing mock IDs remain valid in the mock-only run flow.

## Validation Report (Ticket 4)

Commands run in this worktree and observed outcomes:

1. `npm --prefix app run test:home-contract`
   - Result: `7/7` passing.
   - Confirms real-mode payload shaping:
     - backend audit ID enforcement,
     - no hardcoded/mock database IDs in real mode,
     - `database` omitted when backend DB ID is invalid/missing.
   - Confirms mock-mode behavior remains unchanged.
2. `python3 -m unittest server.test.auth_smoke_test -v`
   - Result: `6/6` passing.
   - Includes authenticated `POST /api/table-populations` smoke path returning `200` (non-404) in test harness:
     `test_authenticated_run_and_query_are_attributed_to_user`.
3. `npm --prefix app run build`
   - Result: pass (build completes; existing non-blocking warnings unchanged).
   - Confirms Home/TemplateCard compile path remains healthy after mode-split hardening.

TemplateCard non-regression check:

1. `rg -n "createTablePopulationFromAudit\\(runTarget.id" app/src/components/TemplateCard.svelte app/src/lib/runFromSpec.js`
   - Result: run creation remains wired in both flows:
     - `app/src/components/TemplateCard.svelte:172`
     - `app/src/lib/runFromSpec.js:105`

## Component Tree

```
src/
├── App.svelte                # Root layout + screen routing
├── lib/
│   ├── api.js                # fetch wrappers for all API endpoints
│   └── templates.js          # Template registry helpers
├── stores/
│   ├── chat.js               # Messages, workbook, command, UI state
│   └── navigation.js         # Screen routing state
└── components/
    ├── HomeScreen.svelte           # Template grid landing page
    ├── TemplateCard.svelte         # Individual template picker
    ├── ConfigScreen.svelte         # Filter configuration before run
    ├── Chat.svelte                 # Message list + upload + prompt input
    ├── FileUpload.svelte           # Drag-and-drop .xlsx upload
    ├── PromptInput.svelte          # Textarea + send button
    ├── MessageBubble.svelte        # Text or chip message renderer
    ├── SpreadsheetChip.svelte      # Clickable result chip
    ├── MainPanel.svelte            # Chat + spreadsheet overlay layout
    ├── SpreadsheetViewer.svelte    # JSpreadsheet workbook grid
    ├── RightPanel.svelte           # Side panel (SQL + result)
    ├── SqlDisplay.svelte           # Monospace SQL display
    ├── SqlResultViewer.svelte      # SQL result JSpreadsheet
    ├── ActivityFeed.svelte         # Live SSE event stream display
    └── ResultsView.svelte          # Post-audit results screen
```

See [`server/README.md`](../server/README.md) for the API contract the frontend consumes.
