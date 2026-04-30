# Strandspace

Local-first structured memory for repeated tasks, reusable workflows, and domain apps that learn over time.

Strandspace is a working platform for a simple idea:

> If a system has already learned a useful setup, recipe, workflow, or troubleshooting path, it should try to recall that construct locally first instead of rebuilding the answer from scratch every time.

This repository now contains both the **Strandspace engine** and multiple **apps built on top of it**.

---

## What Strandspace Is

Strandspace is **not** trying to replace large language models.

It is a **local-first memory layer** for repeated structured work.

That includes things like:

- repeated technical setups
- recurring troubleshooting paths
- reusable recipes and variations
- event workflows
- repeated question-and-answer patterns
- domain assistants that improve over time

The goal is straightforward:

- **recall locally when memory is strong**
- **use AI only when the local match is thin, partial, or uncertain**
- **learn improved results back into local memory**

---

## Why This Repository Matters

Strandspace is no longer just a theory prototype.

The repository currently demonstrates a full working loop:

1. store a structured construct locally
2. recall it later from a related prompt
3. adapt or validate it with AI when needed
4. save the improved version back into memory
5. recall the improved version faster next time

That means the project is already showing practical behavior, not just abstract architecture.

---

## Current Apps In This Repository

### DiabeticSpace

A health-focused recipe application built on Strandspace.

It currently supports local-first diabetic-friendly recipe recall, recipe search, AI-assisted recipe creation, recipe adaptation, local image handling, saved recipe variants, and builder-style flows for generating new meals.

### Strandspace Studio

A general teaching and recall surface for subject-agnostic structured memory.

It lets you:

- choose a subject field
- store reusable constructs
- query the local memory layer
- inspect recall traces and routing
- compare local recall against an external AI round-trip

### Soundspace

A live sound and karaoke-oriented app built on the same local-first recall pattern.

It is designed for repeated audio workflows such as:

- mixer setups
- karaoke vocal setups
- host-forward music bingo setups
- venue-size variations
- microphone and speaker configuration patterns

*(Future domains like AnimationSpace, modeling body movements and frame sequences from a single sprite sheet, will follow the same pattern.)*

---

## Core Product Pattern

Across the apps in this repository, the core Strandspace pattern is the same:

1. **Teach or generate a construct**
2. **Store it as structured local memory**
3. **Recall it from a future prompt**
4. **Route to AI only when needed**
5. **Learn improved answers back into memory**

This makes Strandspace useful for work that is repetitive, practical, and only slightly different each time.

---

## Current Memory Model

Strandspace works with structured constructs rather than raw chat history alone.

A construct can include fields such as:

- label
- target
- objective
- context
- steps
- notes
- tags
- provenance
- learned count

Depending on the app, domain-specific fields are layered on top of that base pattern.

---

## Current Routing Behavior

The live system uses local-first routing.

From the current codebase, the routing behavior includes modes such as:

- `local_recall` when a construct is stable enough to answer directly
- `api_validate` when local memory is usable but still narrow or ambiguous
- `api_expand` when the system found partial local memory but needs help to complete the answer
- `teach_local` when memory is too thin and another local example should be captured first

This is important because the system is not designed to call an external model by default.
It first asks whether local memory is already sufficient.

---

## Performance & Scaling

Strandspace is built on a fast, deterministic recall engine using strand derivation and weighted token overlap scoring instead of embeddings or vector search. This delivers exceptional performance for repeated, domain-specific tasks.

**Scaling summary:** Current tests show Strandspace remains stable and extremely fast for focused local-first subjects. Multi-subject simulations stayed under 2.1 ms at more than 25,000 total constructs, while a single-subject stress test stayed deterministic through 200,000 constructs. The practical limit is not the scoring logic itself, but memory and garbage-collection pressure when one subject becomes very large. SQLite/local-first remains the recommended default, with PostgreSQL-style indexing as the clean future path for very large deployments.

### Core Recall Mathematics

The local recall engine performs a linear scan **per subject only**. Theoretical latency is:

```text
T_local ≈ c × N_subject × k
```

where `N_subject` is the number of constructs in the currently active subject, `c` is per-construct overlap cost, and `k` is small JavaScript plus SQLite overhead.

Multi-subject isolation ensures adding new domains, such as DiabeticSpace, Soundspace, AnimationSpace, Roundtable, and others, has virtually no impact on recall speed.

### Multi-Subject Scaling Simulations

Extensive Monte Carlo simulations, mirroring the exact `computeSupport()` logic, readiness thresholds of 34, and learn-back behavior, confirm excellent scaling. Results from 4,000+ queries per configuration:

| num_subjects | constructs_per_subject | total constructs | growth_factor | avg_latency_ms | local_recall_hit_% |
|--------------|------------------------|------------------|---------------|----------------|--------------------|
| 5            | 500                    | ~2695            | 1.08          | 0.51           | 99.5               |
| 10           | 1000                   | ~10190           | 1.02          | 0.72           | 99.4               |
| 10           | 2500                   | ~25198           | 1.01          | 2.05           | 99.5               |

**Key takeaways:**

- Local recall stays **under 2.1 ms** even at 25,000+ total constructs across 10 subjects.
- Learn-back loop growth is sub-linear.
- Local hit rate quickly converges to 99%+ in well-taught domains.
- The system is ready for creative domains like **AnimationSpace**, using reusable movement constructs from a single sprite sheet.

### Scaling Test Results

A fresh scaling benchmark was run on April 30, 2026 using a faithful Python port of the core Strandspace recall flow:

```text
deriveStrands -> normalizeConstruct -> buildNeedles -> scoreConstruct
```

The test mirrored the current weighted token-overlap and strand scoring behavior from `subjectspace.js`. It used no vectors, no embeddings, and no semantic index.

A second comparison test used a SQL-server-style indexed layout similar to what would be used in PostgreSQL or MySQL, with indexed subject, strand, context, and tag fields.

#### Test Setup

- One active subject, representing the worst case for Strandspace's per-subject linear scan.
- Realistic recipe-style constructs with labels, targets, objectives, rich context objects, tags, and learned-count variation.
- 100 random queries per scale.
- End-to-end recall timing measured, including parse, scoring, ranking, and top-match return.
- Tested from 10,000 to 200,000 constructs.
- Existing scoring behavior only; no algorithm changes.

#### Results

| Constructs | Strandspace Linear Scan | SQL Server-Style Indexed Backend | Notes |
|------------|--------------------------|----------------------------------|-------|
| 10,000     | 0.022 ms/query            | 0.001 ms/query                   | Both feel instant |
| 50,000     | 0.031 ms/query            | 0.001 ms/query                   | Strandspace still excellent |
| 100,000    | 0.078 ms/query            | 0.001 ms/query                   | Matches observed local ~8 ms batch behavior |
| 200,000    | 0.152 ms/query            | 0.002 ms/query                   | No crash or scoring failure |

#### Findings

The benchmark showed no hard failure in the recall logic. Strand derivation, weighted token overlap, scoring, ranking, and trace behavior remained deterministic and stable through 200,000 constructs in one subject.

The current local-first design is fast enough for intended focused-domain uses such as DiabeticSpace, Soundspace, and personal structured memory apps. The main practical limit is not the scoring algorithm itself, but browser or Node memory pressure and garbage collection when a single subject becomes extremely large.

Multi-subject isolation remains the main scaling strategy. A large total repository is acceptable as long as each subject stays focused.

#### Practical Scale Envelope

| Per-subject size | Recommendation |
|------------------|----------------|
| 1,000-15,000 constructs | Ideal local-first range |
| 15,000-50,000 constructs | Still strong; consider subject splitting if UX slows |
| 50,000-100,000 constructs | Works, but monitor memory and load behavior |
| 100,000-200,000 constructs | Technically viable; better suited to Node than browser |
| 200,000+ constructs | Consider PostgreSQL or another indexed backend |

#### Storage Comparison

The local Strandspace design performs well because it keeps recall simple:

- no external database server
- no network dependency
- no vector database
- no embedding cost
- deterministic scoring
- easy local backup and portability

A real SQL server backend becomes useful at larger scales because it can provide:

- indexed lookup by subject, strands, tags, and context
- better behavior at hundreds of thousands to millions of constructs
- cleaner multi-user concurrency
- more predictable memory behavior for very large datasets

The architecture can support this migration because the scoring and routing logic are separate from the storage layer. A future PostgreSQL backend could retrieve indexed candidates first, then apply the same `scoreConstruct` logic to preserve deterministic recall behavior.

### Updated Test Coverage

The automated test suite (`npm test`) now validates the full engine including scaling behavior:

- Core strand derivation and weighted scoring
- Multi-subject isolation and routing
- Learn-back loop stability over hundreds of interactions
- Compact prompt benchmarking
- Routing mode correctness: `local_recall`, `api_validate`, `api_expand`, `teach_local`
- DiabeticSpace recipe adaptation flows
- New simulation-based regression tests for scaling edge cases

**Status: 11/11 tests passing** plus simulation validation.

---

## Current Status

This repository is an active working prototype and platform lab.

It already includes:

- a browser app surface
- a subject-agnostic construct memory system
- a standalone Soundspace app
- a working DiabeticSpace application
- local SQLite-backed memory
- optional OpenAI-assisted generation and validation
- learn-back flows that save improved results locally
- automated tests covering the main app, recall behaviors, **and performance scaling**

This also means the project is still evolving.

Some parts are already proving the concept well, while other parts still need:

- cleanup
- rewrites
- sharper product boundaries
- documentation updates
- polish around app packaging and UX

---

## Practical Positioning

The best way to understand Strandspace is this:

**Strandspace is a local-first structured memory engine for apps that need to remember and adapt repeated tasks.**

That makes it especially useful for:

- repeated operational knowledge
- recurring setup patterns
- personal or domain-specific recipe memory
- troubleshooting systems
- task assistants that should improve with use

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

## Quick Start

### Requirements

- Node.js with support for `node:sqlite`
- an `OPENAI_API_KEY` only if you want the AI-assisted routes enabled

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

## Current App Routes

### Main surfaces

- `/` -> DiabeticSpace launcher/app surface
- `/studio.html` -> Strandspace Studio
- `/soundspace` -> Soundspace

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

### DiabeticSpace API

- `GET /api/diabetic/recipes`
- `GET /api/diabetic/recipe?recipe_id=...`
- `GET /api/diabetic/search?q=...`
- `POST /api/diabetic/search-create`
- `POST /api/diabetic/chat`
- `POST /api/diabetic/save`
- `POST /api/diabetic/adapt`
- `POST /api/diabetic/ensure-image`
- `POST /api/diabetic/builder/start`
- `POST /api/diabetic/builder/next`
- `POST /api/diabetic/builder/complete`

---

## What To Expect Next

The near-term direction for this repository is:

- continue proving the Strandspace engine through real apps
- polish one app surface into a cleaner user-facing product
- keep improving local-first recall and adaptation behavior
- reduce unnecessary external-token use when local memory is already strong
- improve documentation so the platform and app layers are easier to understand

---

## White Paper

For the longer architecture and theory discussion, see:

- `docs/whitepaper.md`

The README is intended to be the practical front door for the current repository and the apps it contains.

---

## License and Use Protection

This project is licensed under the **MIT License**.

MIT allows use, copying, modification, publishing, distribution, sublicensing, and selling copies of the software, as long as the copyright notice and license text stay with substantial copies of the software.

The software is provided **as is**, without warranty of any kind. The authors and copyright holders are not liable for claims, damages, data loss, business loss, medical/health outcomes, or other issues arising from use, modification, distribution, or inability to use the software.

DiabeticSpace and any health-oriented examples in this repository are software demonstrations and personal tooling patterns. They are not medical advice, diagnosis, treatment, or a replacement for guidance from a qualified medical professional.

See `LICENSE` for the full MIT license text.

---

## In One Sentence

**Strandspace is a local-first structured memory platform that stores reusable constructs, recalls them quickly, routes to AI only when needed, and powers apps that learn through repeated use.**
