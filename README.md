# Strandspace

[![Node 20+](https://img.shields.io/badge/node-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-339933)](#license-status)
[![Local-first](https://img.shields.io/badge/runtime-local--first-126b73)](#why-strandspace)

Last updated: 2026-04-20

Strandspace is a local-first recall workspace for reusable knowledge constructs. It ships with two focused modes:

- `Subjectspace` for structured capture and recall across a subject field
- `Music Engineering` as a first-class subject inside the unified topic-view flow for mixer, preset, venue, and event-specific memory

The app prefers local recall first, uses OpenAI only when configured, and stays useful with no API key.

Prominent white paper links:

- [White paper (PDF)](./strandspace-white-paper.pdf)
- [White paper summary (Markdown)](./docs/white-paper-summary.md)

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- Main construct builder: `/`
- Backend workspace: `/`
- Legacy `/studio` route now opens the backend workspace
- Topic view: `/subject?subjectId=music-engineering`
- SQLite editor and DB size display live inside the backend data browser
- Recall Lab in the backend now loads a cleaner construct-title search and fills the matched construct back into the editor
- Dataset health now audits construct quality, semantic anchors, broken related IDs, and release readiness from the backend

If you do not set `OPENAI_API_KEY`, the app runs in local-only mode. Recall, library browsing, seed data, and construct editing still work; OpenAI assist and benchmark assist calls are simply disabled.

## Demo Screens

### Music Engineering Query Guidance

![Music Engineering query guidance](./docs/assets/soundspace-query-guidance.png)

### Benchmark View

![Strandbase vs LLM benchmark](./docs/assets/benchmark-panel.png)

### Query Composer

![Music Engineering query composer](./docs/assets/soundspace-query-composer.png)

## Example Use Cases

### 1. Build a reusable construct from rough notes

Prompt:

```text
Subject: Music Engineering
Target: Lead vocal on Yamaha MG10XU
Objective: clear lead vocal with safe feedback margin
Context:
room: small club
source: wired cardioid vocal mic
Steps:
- Trim rumble before boosting presence
- Keep reverb subtle
```

### 2. Recall only the part you need

Prompt:

```text
t8s eq for handheld vocal
```

### 3. Ask for a missing mic-specific strand

Prompt:

```text
t8s shure mic setting
```

### 4. Compare local recall speed with API assist

Prompt:

```text
What is my festival stage scene recall habit?
```

## Why Strandspace?

| Strandspace local recall | Typical LLM-only recall |
| --- | --- |
| Reuses stored constructs with context, steps, notes, and tags | Rebuilds an answer from scratch every time |
| Works with no API key | Usually depends on a live model call |
| Can answer from partial cues and only return the requested section | Often returns a broad answer unless heavily prompted |
| Lets you extend and store improvements as memory | Improvements are easy to lose between chats |
| Makes latency visible with compare mode | Latency is usually hidden behind a single response |

Strandspace is especially useful when the answer should become better local memory after each pass instead of becoming another disconnected message.

## What It Is Becoming

Strandspace is moving toward a local-first chatbot that:

- starts from reusable constructs instead of empty prompts
- learns new subject knowledge through reviewable memory updates
- keeps common subject recall fast and inspectable
- reduces repeated LLM calls as the local construct field gets stronger

The same pattern can support music engineering, Python engineering, accounting coding, and other domain-specific assistants where repeated structure matters.

## Configuration

Create `.env` from `.env.example`:

```env
# Optional - enables LLM assist and benchmarks
OPENAI_API_KEY=sk-...

# Optional - custom DB path
STRANDSPACE_DB_PATH=data/strandspace.sqlite
```

Notes:

- Default port is `3000`. Set `PORT` to override it.
- The selected SQLite path is logged at startup.
- OpenAI enabled/disabled state is logged at startup.
- `STRANDSPACE_LOG_LEVEL` can be set to `debug`, `info`, `warn`, or `error`.
- With no key, the UI falls back gracefully to local-only behavior.

## Scripts

```bash
npm run dev
npm run start
npm run test
npm run clean
npm run dataset:health
npm run dataset:clean
npm run kill
npm run restart
```

What they do:

- `clean` removes the local Strandspace SQLite files and common local server logs
- `dataset:health` audits the stored subjectspace dataset plus the bundled seed packs
- `dataset:clean` safely normalizes the active dataset, repairs broken related IDs, and refreshes local relations
- `kill` stops project-related `node` / `npm` dev processes
- `restart` stops the current dev process and starts the server again

## Benchmarks

- Model Lab endpoints: `GET /api/model-lab/status`, `POST /api/model-lab/compare`, `GET /api/model-lab/reports`.
- Benchmark coverage lives in `test/benchmark-tests.mjs` and runs via `npm test`.
- Generate a local markdown snapshot with `npm run benchmark:report` (writes `docs/benchmark-history.md`).
- Optional assist token metrics: set `STRANDSPACE_LOG_ASSIST_TOKEN_METRICS=1` to log estimated token breakdowns for the OpenAI assist request/response.
- Optional assist payload metrics: set `STRANDSPACE_LOG_ASSIST_PAYLOAD_METRICS=1` to log estimated before/after payload size.
- Payload benchmark mode: send `payloadBenchmark: true` in `POST /api/model-lab/compare` to compare `baseline_full` vs `cue_only` vs `reduced` assist payload modes.
- Estimated cost output in payload benchmarking requires either `STRANDSPACE_OPENAI_PRICING_JSON='{\"model\":{\"inputUsdPer1M\":0,\"outputUsdPer1M\":0}}'` or `STRANDSPACE_OPENAI_INPUT_USD_PER_1M` / `STRANDSPACE_OPENAI_OUTPUT_USD_PER_1M`.

## Seeded Examples

The bundled examples include:

- music-engineering constructs for gain staging, signal flow, vocal chains, monitor mixes, feedback control, EQ troubleshooting, parallel compression, and scene recall habits
- venue presets for small club, festival stage, conference room, studio control room, and karaoke bar workflows

Use the `Reset with Examples` button in the UI to restore the demo library.

The repository also includes a broader release-oriented starter pack in [data/release-subject-seeds.json](./data/release-subject-seeds.json) with cleaner examples for:

- music engineering
- Python engineering
- accounting coding

That release pack is intended to show how Strandspace can evolve into a domain chatbot that learns locally over time and needs less model help as its construct field grows.

## Development Notes

- Local runtime state is stored in SQLite and ignored by Git.
- Legacy local databases can still be migrated into the preferred `strandspace.sqlite` path.
- Request timeouts and graceful shutdown handling are built in for the server and OpenAI assist layer.
- The current automated suite lives in `test/run-tests.mjs`.

## Verification

Recently verified:

- `npm test` passes
- backend overview responds with live dataset health, DB size, and table counts
- `/backend` renders the admin workspace sections in a headless browser smoke check

## Project Docs

- Backend workspace guide: [docs/backend-workspace.md](./docs/backend-workspace.md)
- Dataset health and release prep: [docs/dataset-health.md](./docs/dataset-health.md)
- Theory of Strandspace: [docs/THEORY_OF_STRANDSPACE.md](./docs/THEORY_OF_STRANDSPACE.md)
- White paper summary: [docs/white-paper-summary.md](./docs/white-paper-summary.md)
- White paper PDF: [docs/strandspace-white-paper.pdf](./docs/strandspace-white-paper.pdf)

The backend workspace guide covers the construct builder, AI subject mapper, Recall Lab, SQLite editor, and the live database size indicator shown in the data browser header. The dataset health doc covers the new audit and clean workflow for keeping construct data ready for future release packs.

## License Status

This repository is released under the MIT License. See [LICENSE](./LICENSE) for details.
