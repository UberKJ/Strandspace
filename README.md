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

**Windows local install:** see `docs/windows-installer.md`.

Examples of the current behavior include:

- creating a first-pass diabetic-friendly recipe with AI
- saving that recipe into local memory
- recalling it later from local storage
- adapting it into a new variant such as adding or changing ingredients
- storing the changed version for future recall

This is one of the clearest demonstrations of the Strandspace idea because it shows memory, variation, and learn-back behavior in a user-facing app.

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

For example:

- **Soundspace** adds device and event setup details
- **DiabeticSpace** adds recipe, ingredient, meal-type, and adaptation flows

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

## What Makes Strandspace Different

Strandspace is not just generic text search.

It is trying to preserve **reusable working structure**.

Instead of paying the full cost of broad reasoning every time, the platform tries to:

- identify the repeated task
- reactivate the right stored construct
- emit a usable answer from local memory
- escalate outward only when needed

In practice, that means it behaves more like a **memory layer for repeated work** than a general-purpose chatbot.

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
- automated tests covering the main app and recall behaviors

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

## License

This project is licensed under the **GNU General Public License v3.0**.

See `LICENSE` for the full text.

---

## In One Sentence

**Strandspace is a local-first structured memory platform that stores reusable constructs, recalls them quickly, routes to AI only when needed, and powers apps that learn through repeated use.**
