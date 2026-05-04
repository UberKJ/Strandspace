# Strandspace

Strandspace is a local-first construct memory engine that recalls reusable knowledge from partial cues and routes to an LLM only when local recall is not sufficient.

It is built for repeated structured work: recipes, troubleshooting paths, live-sound setups, domain workflows, and assistants that should improve through use instead of starting over every time.

---

## Why It Matters

Most AI-assisted systems repeatedly spend full inference cost on tasks they have already solved before. Strandspace tests a narrower claim:

> If a useful construct has already been learned, the system should try to recall it locally before rebuilding the answer from scratch.

The current repository demonstrates that loop in working applications:

1. store a structured construct locally
2. recall it from a related future prompt
3. route to AI only when the local match is thin or uncertain
4. save the improved result back into memory
5. recall the improved construct faster next time

---

## What This Is Not

Strandspace is not a vector database.

It is not an LLM wrapper.

It is not a replacement for LLMs.

It is a local-first structured memory layer for repeated work where the same underlying construct appears with small variations over time.

---

## Current Status

Strandspace is an active working prototype and platform lab.

The repository currently includes:

- a subject-agnostic construct memory engine
- local SQLite-backed memory
- deterministic strand/token-overlap recall
- local-first routing modes
- optional OpenAI-assisted generation and validation
- learn-back flows that save improved results locally
- automated tests for core recall, routing, app behavior, and scaling simulations
- three current app surfaces: DiabeticSpace, Strandspace Studio, and Soundspace

---

## Current Apps

### DiabeticSpace

A diabetic-friendly recipe recall, generation, and adaptation app built on Strandspace.

It demonstrates local-first recipe search, saved recipe variants, AI-assisted recipe creation, recipe adaptation, local image handling, and builder-style meal generation.

### Strandspace Studio

A general teaching and recall surface for subject-agnostic structured memory.

It lets users create constructs, query local memory, inspect recall traces, and compare local recall against an external AI round trip.

### Soundspace

A live sound and karaoke-oriented app for repeated audio workflows such as mixer setups, karaoke vocal setups, venue-size variations, microphone configuration, and speaker setup patterns.

---

## Core Pattern

Across all apps, the Strandspace loop is:

1. teach or generate a construct
2. store it as structured local memory
3. recall it from a future prompt
4. route to AI only when needed
5. learn improved answers back into local memory

---

## Evidence

Current scaling and benchmark details live in:

- [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md)

The short version:

- local recall is deterministic
- focused subjects remain fast at practical local-first sizes
- multi-subject isolation keeps unrelated domains from slowing each other down
- larger deployments can move candidate retrieval to indexed SQL while preserving the same scoring model

---

## Design

Architecture details live in:

- [`docs/DESIGN.md`](docs/DESIGN.md)

That document covers:

- constructs and strands
- local recall scoring
- routing modes
- learn-back behavior
- trust/readiness thresholds
- SQLite/local-first storage
- future indexed SQL backend path

---

## Falsification Conditions

The Strandspace thesis weakens if local construct recall stops outperforming local LLM inference for repeated known tasks as construct count scales, or if compact prompts cannot preserve construct identity under realistic variation.

The project should be evaluated by whether repeated work becomes cheaper, faster, and more reliable after the system has learned useful constructs.

---

## Quick Start

### Requirements

- Node.js with support for `node:sqlite`
- `OPENAI_API_KEY` only if AI-assisted routes are enabled

### Install

```bash
npm install
```

### Run

```bash
npm run dev
```

### Test

```bash
npm test
```

---

## Repository Layout

```text
.
├─ README.md
├─ LICENSE
├─ docs/
│  ├─ DESIGN.md
│  ├─ BENCHMARKS.md
│  ├─ ROADMAP.md
│  └─ whitepaper.md
├─ public/
│  ├─ index.html
│  ├─ studio.html
│  └─ soundspace/
├─ strandspace/
│  ├─ openai-assist.js
│  ├─ sound-llm.js
│  ├─ soundspace.js
│  ├─ subjectspace.js
│  ├─ diabeticspace.js
│  └─ diabetic-assist.js
├─ test/
│  ├─ run-tests.mjs
│  └─ diabeticspace-tests.mjs
├─ data/
└─ server.mjs
```

---

## Current Routes

Detailed API route documentation belongs in [`docs/DESIGN.md`](docs/DESIGN.md) or a future `docs/API.md`.

Main app surfaces:

- `/` — DiabeticSpace
- `/studio.html` — Strandspace Studio
- `/soundspace` — Soundspace

---

## Roadmap

See:

- [`docs/ROADMAP.md`](docs/ROADMAP.md)

---

## White Paper

For the longer architecture and theory discussion, see:

- [`docs/whitepaper.md`](docs/whitepaper.md)

---

## License and Use Protection

This project is licensed under the **MIT License**.

MIT allows use, copying, modification, publishing, distribution, sublicensing, and selling copies of the software, as long as the copyright notice and license text stay with substantial copies of the software.

The software is provided **as is**, without warranty of any kind. The authors and copyright holders are not liable for claims, damages, data loss, business loss, medical/health outcomes, or other issues arising from use, modification, distribution, or inability to use the software.

DiabeticSpace and any health-oriented examples in this repository are software demonstrations and personal tooling patterns. They are not medical advice, diagnosis, treatment, or a replacement for guidance from a qualified medical professional.

See [`LICENSE`](LICENSE) for the full MIT license text.
