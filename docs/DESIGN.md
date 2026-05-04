# Strandspace Design

Strandspace is a local-first structured memory engine for repeated learned work.

A prompt is treated as an activation event. The system tries to reactivate a useful stored construct before routing to an external model.

---

## Core Idea

Strandspace is built around a narrow practical claim:

> If a useful construct has already been learned, the system should try to recall it locally before rebuilding the answer from scratch.

The system is not designed to call an LLM by default. It first asks whether local memory is strong enough to answer, whether the memory should be validated, whether it should be expanded, or whether another local example should be taught first.

---

## Constructs

A construct is a reusable unit of learned work.

A construct can represent things like:

- a diabetic-friendly recipe
- a saved recipe variation
- a mixer setup
- a karaoke vocal setup
- a troubleshooting path
- a repeated workflow
- a reusable domain answer

Common construct fields include:

- label
- target
- objective
- context
- steps
- notes
- tags
- provenance
- learned count
- derived strands

The point is not to store every possible phrasing. The point is to store the useful reusable structure and enough cues to reactivate it later.

---

## Strands

Strands are local cues used to reactivate constructs.

They can represent:

- task intent
- domain anchors
- objects involved
- constraints
- tags
- context hints
- repeated wording patterns

A prompt does not need to exactly match the original construct. It needs to activate enough overlapping strands for the system to identify the useful learned structure.

---

## Recall Pipeline

The current local recall flow can be summarized as:

```text
deriveStrands -> normalizeConstruct -> buildNeedles -> scoreConstruct
```

At a product level, the pipeline is:

1. receive query
2. derive query strands
3. select active subject
4. build search needles
5. score candidate constructs
6. rank matches
7. choose routing mode
8. answer locally or escalate

The current scoring model uses deterministic strand and weighted token overlap. It does not require embeddings, vector search, or an external network call.

---

## Subject Isolation

Strandspace performs recall inside the active subject.

This matters because unrelated domains should not compete in every query. A diabetic recipe prompt should not be slowed down by a large collection of live-sound constructs, and a Soundspace mixer prompt should not be polluted by recipe memory.

Subject isolation is also a scale strategy. A large total repository can remain practical as long as each subject stays focused.

---

## Routing Modes

The current local routing modes are:

- `local_recall` — local memory is stable enough to answer directly
- `api_validate` — local memory is usable, but the match is narrow or contested
- `api_expand` — partial memory exists, but not enough to trust without help
- `teach_local` — local memory is too thin; capture another local example first

The routing layer is the boundary between memory and external reasoning. It decides whether a local answer is enough or whether an external model should be used.

---

## Trust and Readiness Ladder

A useful way to think about routing is as a trust ladder:

| Evidence level | Route | Meaning |
|---|---|---|
| Low evidence | `teach_local` | Memory is too thin. Add or teach a construct first. |
| Partial evidence | `api_expand` | Something relevant was found, but it needs completion. |
| Usable but uncertain | `api_validate` | Local recall is plausible but should be checked. |
| Stable evidence | `local_recall` | Local memory is strong enough to answer directly. |

The exact threshold behavior can evolve, but the design goal should remain stable: external reasoning is reserved for cases where local memory is insufficient.

---

## Learn-Back Loop

Across the current apps, the active loop is:

1. local recall attempts to answer
2. AI assistance is used only when the local route says it is warranted
3. the refined construct is optionally learned back into local memory
4. future prompts can recall the improved construct faster
5. variants can accumulate instead of being regenerated from nothing

The learn-back loop is central to Strandspace. Without it, the system is just retrieval. With it, repeated work can become cheaper and more stable over time.

---

## Storage Model

The current default storage path is local-first SQLite.

SQLite is appropriate for:

- local apps
- personal memory
- single-user or small-team deployments
- focused subject collections
- easy local backup and portability
- deterministic recall without external database infrastructure

For larger deployments, Strandspace can move candidate retrieval to an indexed SQL backend while preserving the same scoring logic.

A larger SQL backend becomes useful when a project needs:

- hundreds of thousands to millions of constructs per subject
- multi-user concurrency
- server-side indexing
- lower memory pressure in browser or Node runtimes
- more predictable behavior for very large datasets

The scale path should not require replacing Strandspace recall. It mainly changes how candidate constructs are fetched before scoring.

---

## Indexed SQL Scale Path

The future indexed SQL path should work like this:

1. use indexed fields such as subject, strands, tags, and context to fetch a candidate set
2. apply the same deterministic `scoreConstruct` logic to the candidate set
3. preserve traceability and routing behavior
4. avoid turning Strandspace into a black-box vector search system

This lets Strandspace scale without discarding the core design: local construct recall first, external model only when needed.

---

## App Surfaces

### Subjectspace

Subjectspace is the generic structured memory layer.

It supports teaching, storing, querying, recalling, comparing, assisting, and learning reusable constructs across subject fields.

### DiabeticSpace

DiabeticSpace is a recipe recall, creation, and adaptation app.

It demonstrates local-first memory for food planning, recipe variants, saved adaptations, GI-oriented notes, and AI-assisted generation when local memory is not enough.

DiabeticSpace is a software demonstration and personal tooling pattern. It is not medical advice, diagnosis, treatment, or a replacement for guidance from a qualified medical professional.

### Soundspace

Soundspace is a live sound and karaoke-oriented app.

It demonstrates local-first memory for repeated setup patterns such as mixer scenes, host-forward vocal setups, venue-size variations, microphone configurations, and speaker layouts.

---

## Current Main Routes

Main app surfaces:

- `/` — DiabeticSpace
- `/studio.html` — Strandspace Studio
- `/soundspace` — Soundspace

Subjectspace API examples:

- `GET /api/subjectspace/subjects`
- `GET /api/subjectspace/library?subjectId=...`
- `GET /api/subjectspace/assist/status`
- `GET /api/subjectspace?q=...&subjectId=...`
- `GET /api/subjectspace/recall?q=...&subjectId=...`
- `POST /api/subjectspace/learn`
- `POST /api/subjectspace/assist`
- `POST /api/subjectspace/compare`
- `POST /api/subjectspace/answer`

Soundspace API examples:

- `GET /api/soundspace?q=...`
- `GET /api/soundspace/recall?q=...`
- `GET /api/soundspace/library`
- `POST /api/soundspace/learn`
- `POST /api/soundspace/answer`

DiabeticSpace API examples:

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

A future `docs/API.md` can move these routes into a dedicated reference document.

---

## Design Limits

Strandspace is not semantic omniscience.

It is not vector search.

It is not a substitute for model reasoning.

It works best when useful repeated constructs have been taught, saved, or generated before. Local memory quality depends on construct quality. Overlapping constructs require careful scoring, trace inspection, and benchmark coverage.

The design should be judged by whether repeated learned work becomes cheaper, faster, and more dependable over time.
