# Backend Workspace Guide

This guide documents the current backend/admin workspace in Strandspace. It is meant to help contributors and evaluators understand how the main admin page is organized and how the local-first editing loop works.

Open the backend workspace at:

- `http://localhost:3000/`

The legacy `/studio` route now resolves to the same backend page.

## What Lives In The Backend

The backend page combines five workflows into one place:

1. Subject selection
2. AI subject mapping
3. Construct builder and editor
4. Recall Lab and benchmark tools
5. Dataset health and release cleanup
6. SQLite data browser

The goal is to keep memory building, memory recall, and low-level row inspection in the same workspace instead of splitting them across disconnected screens.

## AI Subject Mapper

The `AI Subject Mapper` panel lets you describe a subject in plain language and ask AI for suggested starter constructs.

It is designed for cases like:

- defining a new knowledge field
- bootstrapping a new memory library
- turning a rough subject description into reusable construct ideas

Important behavior:

- it stays in review mode
- it does not auto-store suggestions
- each suggestion can be loaded into the builder before saving
- it uses the same timeout/error handling as the other OpenAI-backed routes

## Construct Builder

The builder takes rough notes and shapes them into a structured construct draft.

Typical flow:

1. Paste rough notes into the builder input.
2. Review the draft loaded into the editor.
3. Refine target, objective, context, steps, notes, and tags.
4. Store the construct into Subjectspace.

When related constructs already exist, the builder can extend the active construct instead of replacing it.

## Recall Lab

The backend `Recall Lab` is the Subjectspace-side recall tester.

Recent behavior to know:

- quick recall chips now prefer cleaner construct-title searches
- selecting a stored construct loads its title as the recall search
- running recall loads the matched construct back into the editor automatically when local recall succeeds
- this makes the backend recall flow feel closer to Soundspace's search-load-edit loop

That means the backend page now supports a tighter workflow:

1. pick a stored construct
2. run a local recall test
3. inspect the answer and trace
4. edit the matched construct immediately

## Benchmark Panel

The benchmark section compares local Strandbase recall against the LLM assist round-trip.

It is useful for showing:

- local-first latency
- token savings from compact prompts
- when local recall is already strong enough
- how much slower assisted generation is compared with direct memory recall

## Dataset Health

The backend now includes a dataset health panel that audits the active subject field.

It reports:

- release-readiness score
- average construct relevance
- missing target, steps, tags, context, and notes
- broken related construct IDs
- thin constructs that need richer anchors

The clean action is intentionally safe. It normalizes stored construct fields, removes broken related IDs, and refreshes links and strands without rebuilding the database.

## SQLite Data Browser

The backend includes a row-level SQLite browser and editor for safe inspection of stored memory.

The data browser currently shows:

- available backend tables
- selected table rows
- schema details
- editable vs read-only row status
- live SQLite path
- live database size in the section header

The database size indicator is pulled from backend overview metadata and shown at the top of the data browser so operators can quickly see how large the current local memory store is.

## Local-First Behavior

The backend is still designed around local-first recall:

- local recall happens before assist paths
- OpenAI assist remains optional
- the app still runs in local-only mode with no API key
- timeout handling prevents indefinite hangs
- graceful shutdown closes SQLite cleanly

## Related Files

These are the main files behind the backend workspace:

- `public/index.html`
- `public/app.js`
- `public/style.css`
- `server.mjs`
- `strandspace/openai-assist.js`

## Validation

Use these commands while working on backend/admin changes:

```bash
npm test
npm run dev
```

The current test suite covers backend overview behavior, data browser APIs, Subjectspace recall, Soundspace recall, assist timeouts, and several admin-oriented flows.
