# Strandspace Studio

Local-first construct recall for repetitive learned tasks, adaptive workflows, and optional LLM-assisted expansion.

Strandspace Studio is a working prototype built around one practical idea:

**When a system has already learned a repeated setup, route, workflow, or operating pattern, it should try local recall first instead of rebuilding the answer from scratch every time.**

---

## Current Status

Strandspace Studio is an active prototype with a working browser app, a standalone Soundspace surface, seeded local memory, API-assisted draft expansion, and regression coverage for the main recall flows.

As the code stands today, the application provides:

- a main **Subjectspace** studio for teaching and recalling reusable constructs
- a standalone **Soundspace** app for live audio and karaoke-style setup recall
- local-first routing that can recommend direct recall or API validation
- optional OpenAI-backed assist drafts that can be learned back into local memory
- a benchmark panel that compares local recall latency against an LLM assist round-trip
- a SQLite-backed local store with seeded starter data
- an automated test suite covering the core routes and learning flows

---

## What Strandspace Is

Strandspace is not trying to replace large language models.

It is a memory-and-construct layer for repeated work.

That includes things like:

- recurring technical setups
- repeated troubleshooting paths
- event workflows
- route-like task sequences
- domain assistants that answer the same kind of question with small variations
- agents that should remember what already worked

The point is simple:

**Recall what is already learned. Use external reasoning only when local memory is too thin, too narrow, or too uncertain.**

---

## Current Application Surfaces

### Strandspace Studio

The main app at `/` is a subject-agnostic teaching and recall interface.

It currently lets you:

- choose an active subject
- enter a recall prompt
- inspect the returned answer and activation trace
- store new constructs with subject, target, objective, context, steps, notes, and tags
- browse the stored construct library for the active subject
- compare local recall speed against the LLM assist path

The current UI language centers on four layers:

1. trigger strands
2. anchor strands
3. composite constructs
4. expression field

### Soundspace

The standalone app at `/soundspace` is a domain-specific recall surface for live sound.

It is designed around repeated audio questions such as:

- mixer setup recall
- karaoke vocal setup recall
- music bingo host setups
- venue-size variations
- microphone and speaker configuration patterns

Soundspace recalls a stored construct first and can generate a missing construct when needed, then store it for future recall.

---

## Current Memory Model

The repository currently exposes two working layers in code.

### Subjectspace

Subjectspace is the general-purpose construct memory system.

A stored construct can include fields such as:

- subject label and subject ID
- construct label
- target
- objective
- structured context
- working steps
- notes
- tags
- provenance

This is the main reusable memory layer behind Strandspace Studio.

### Soundspace

Soundspace is the seeded domain layer built on the same general recall idea, but with a schema tuned for sound workflows.

A sound construct can include fields such as:

- device brand and model
- device type
- source type
- venue size
- event type
- setup guidance
- tags
- strands
- summary text

---

## Current Routing Behavior

The app is built around local-first recall.

From the current code and tests, the active routing behavior includes:

- `local_recall` when the construct is stable enough to answer directly
- `api_validate` when local recall is usable but narrow or ambiguous
- API-assisted draft generation when the user explicitly invokes the assist path
- generated-and-stored behavior in Soundspace when a matching construct does not already exist or generation is forced

That means the live system already does more than simple keyword lookup. It attempts to route between direct reuse, validation, and fresh construct creation.

---

## Current Benchmarking

The current benchmark feature compares:

- **local Strandbase recall**
- **LLM assist round-trip latency**

The benchmark is tied to the current recall flow and is exposed in the Studio interface through the **Compare local vs LLM** action.

This is important because the application is not only trying to answer correctly. It is also trying to show when repeated recall can be served from local memory much faster than an external call.

---

## OpenAI Assist Integration

OpenAI assist is optional.

When `OPENAI_API_KEY` is configured, the Subjectspace assist route can:

- generate a draft validation or expansion response
- turn that result into a suggested construct
- optionally save that construct back into local memory

When the API key is not present, the app reports that assist is unavailable instead of pretending the remote path is active.

---

## What the Current Test Suite Covers

The current automated suite covers **11 passing tests** around the live app surface.

Those tests verify behavior such as:

- serving the main Strandspace Studio interface
- serving the standalone Soundspace interface
- exposing seeded subject lists
- storing and recalling a custom Subjectspace construct
- routing ambiguous recall toward API validation
- reporting assist-disabled status when no API key is present
- comparing local recall against a mocked LLM round-trip
- returning an OpenAI-backed draft that can be saved into local memory
- recalling a seeded Soundspace mixer setup
- learning a new Soundspace construct for later reuse
- generating and storing a missing Soundspace construct on demand

---

## Why This Matters

A lot of software keeps paying the full retrieval or reasoning cost for work it has effectively already learned.

Strandspace is aimed at a narrower, more practical problem:

**How do you let a system remember repeated working patterns, recall them quickly, and only expand outward when the stored memory is not enough?**

That makes it useful for domains where the work is repetitive but not perfectly identical.

---

## Quick Start

### Requirements

- Node.js with support for `node:sqlite`
- an `OPENAI_API_KEY` only if you want the Subjectspace assist path enabled

### Install

```bash
npm install
```

### Run

```bash
npm run dev
```

The app runs at:

- `http://localhost:3000/`
- `http://localhost:3000/soundspace`

### Run tests

```bash
npm test
```

---

## Key Routes

### App routes

- `/` -> Strandspace Studio
- `/soundspace` -> standalone Soundspace app

### Subjectspace API

- `GET /api/subjectspace/subjects`
- `GET /api/subjectspace/library?subjectId=...`
- `GET /api/subjectspace/assist/status`
- `GET /api/subjectspace?q=...&subjectId=...`
- `GET /api/subjectspace/recall?q=...&subjectId=...`
- `POST /api/subjectspace/learn`
- `POST /api/subjectspace/assist`
- `POST /api/subjectspace/compare`
- `POST /api/subjectspace/answer`

### Soundspace API

- `GET /api/soundspace?q=...`
- `GET /api/soundspace/recall?q=...`
- `GET /api/soundspace/library`
- `POST /api/soundspace/learn`
- `POST /api/soundspace/answer`

---

## Repository Layout

```text
.
├─ README.md
├─ LICENSE
├─ docs/
│  └─ whitepaper.md
├─ public/
│  ├─ index.html
│  └─ soundspace/
├─ strandspace/
│  ├─ openai-assist.js
│  ├─ sound-llm.js
│  ├─ soundspace.js
│  └─ subjectspace.js
├─ test/
│  └─ run-tests.mjs
├─ data/
└─ server.mjs
```

---

## License

This project is licensed under the **GNU General Public License v3.0**.

See `LICENSE` for the full text.

---

## White Paper

For the longer theory and architecture discussion, see:

- `docs/whitepaper.md`

The README is the practical front door for the current app.

---

## Positioning in One Sentence

**Strandspace Studio is a local-first construct memory system for repeated tasks that recalls learned patterns, benchmarks local recall against external assist, and stores improved answers for future reuse.**
