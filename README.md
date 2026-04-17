# Strandspace Studio

**Query-triggered semantic recall with compact prompt benchmarking**

Strandspace Studio is a working prototype for **local-first semantic memory**.
Instead of rebuilding answers from scratch every time, it stores reusable constructs that can be reactivated from partial cues.

> **Store the pieces. Store the triggers. Store the rules that let meaning form.**

---

## Project Status

Prototype in active development.
Core recall, routing, learn-back, and benchmark flows are working.
Benchmark and payload optimization are ongoing.

---

## What Strandspace Is

Most AI systems solve repeated questions by paying the same broad retrieval cost again and again. They search flat text, long prompt histories, or wide context windows even when the user is really asking about the same learned setup with only minor variations.

Strandspace takes a different path.

It treats a query as an **activation event**, not just a text lookup.

A prompt triggers:

- **Trigger strands** to identify intent
- **Anchor strands** to narrow domain and context
- **Composite constructs** to reactivate reusable working knowledge
- An **expression field** to form a temporary answer only when the construct is stable enough

This lets the system answer familiar, repeated questions locally first, and use an LLM only when confidence is too low or expansion is actually needed.

---

## Current Product Structure

Strandspace Studio currently has two main layers:

### Subjectspace

A generic memory layer that can be taught for almost any domain.

A stored construct can include:

- subject label and subject ID
- construct label
- target or focus
- objective
- structured context
- ordered working steps
- notes
- tags
- derived strands
- provenance and learned count

Subjectspace is the general engine: teach it a reusable construct, then let future prompts reactivate it.

### Soundspace

A seeded domain layer built on top of the same recall model.

It demonstrates how Strandspace can work in:

- live sound
- music engineering
- karaoke setup workflows
- microphone gain staging
- repeatable mixer or monitor scenes

Soundspace exists because this kind of work repeats constantly with small changes. Most of the time, the system does not need to reinvent the answer. It needs to recall, refine, and reuse.

---

## Why This Matters

Traditional AI workflows often:

- do not preserve reusable working structure well
- resend more context than the question really needs
- make repeated domain recall slower and more expensive than necessary

Strandspace is built around a narrower and more practical claim:

> When the system has already learned a reusable construct, local recall should be cheaper, faster, and more efficient than a full LLM round-trip.

It does **not** try to replace LLMs.

It tries to stop using them as the first hammer for every nail.

---

## Routing Logic

Strandspace uses local-first routing instead of defaulting to an external API.

Current routing modes:

- `local_recall`  
  The construct is stable enough to answer directly.

- `api_validate`  
  Local recall is usable, but the match is narrow or contested.

- `api_expand`  
  The system found partial recall, but not enough to trust without help.

- `teach_local`  
  Local memory is too thin to justify expansion yet.

Before spending tokens externally, the system asks:

**Is local memory already enough?**

---

## Learn-Back Loop

When the API assist path is used, the result does not have to vanish into the fog.

Strandspace can learn the improved answer back into local memory:

1. Local recall tries to answer
2. API assist is used only when warranted
3. The validated or expanded construct is optionally saved
4. Future prompts can recall the refined construct faster

That creates a feedback loop where repeated work becomes progressively cheaper.

---

## Compact Prompt Benchmarking

One of the most important updates in the current version is the benchmark rewrite.

The system no longer compares local recall vs LLM using only the original raw user prompt.

Instead, Strandspace now tries to generate a **shorter benchmark prompt** and accepts it only if local recall can prove that the compact prompt lands on the **same construct**.

### Current benchmark flow

1. Start from the user question
2. Generate shorter recall candidates from the matched construct
3. Re-run local recall on those shorter candidates
4. Accept a compact benchmark prompt only if it recalls the same construct
5. Time both the local path and the LLM path against that compact, semantically equivalent prompt

This turns benchmarking into something more meaningful than a stopwatch race.

It tests whether Strandspace can **compress the cue set while preserving recall identity**.

---

## Current Validation Status

As of **April 15, 2026**, the active regression suite passes **11 of 11 tests**.

The suite currently covers:

### App shell and routing surface

- serves the Strandspace Studio interface
- serves the standalone Soundspace interface
- exposes seeded subject lists correctly

### Subjectspace local memory

- stores and recalls a custom construct
- routes ambiguous recall toward API validation
- reports assist status correctly when the API key is unavailable
- verifies compact benchmark prompting still recalls the same construct
- returns an OpenAI-backed draft that can be saved back into local memory

### Soundspace seeded retrieval

- recalls a seeded mixer setup
- stores a new sound construct for later recall
- generates and stores a missing sound construct on demand

### Database and cleanup behavior

- test runs use temporary SQLite databases
- stale test-created data has been cleaned from production storage
- fallback database selection no longer prefers backup or test databases incorrectly

---

## Benchmark Findings

The current prototype shows a strong directional result:

- local Strandspace recall is dramatically faster than an LLM round-trip on repeated prompts
- compact prompting reduces the user-side cue payload
- the system can preserve construct identity even when the benchmark prompt is shortened

### Example benchmark capture

A live benchmark shown in the UI reported:

- original prompt: about **23 estimated tokens**
- compact benchmark prompt: about **8 estimated tokens**
- estimated savings: **15 tokens**
- local recall: **4.590 ms**
- LLM assist round-trip: **3388.3 ms**
- observed speedup: **738.2x** in favor of local recall

A second verification under a different subject showed:

- original prompt: about **41 estimated tokens**
- compact benchmark prompt: about **9 estimated tokens**
- estimated savings: **32 tokens**
- local recall: **0.388 ms**
- LLM assist round-trip: **5462.432 ms**

These results do **not** mean LLM usage has already been minimized end to end.

They do mean Strandspace is already shrinking the **user-query side** of recall and proving that learned constructs can be reactivated cheaply once they stabilize.

---

## Important Interpretation Note

Prompt savings and total LLM usage are **not the same thing**.

Even when the compact benchmark prompt is much shorter, the current API assist path still includes routing data and a local recall snapshot. That means total LLM token usage can still be large.

This is not a contradiction. It is an engineering signal.

It means:

- Strandspace is already reducing the user-side cue set
- the current assist payload still carries more context than necessary
- future optimization should reduce that assist packaging further

---

## What Strandspace Currently Proves

The current build supports a stronger claim than the earlier prototype:

- a working local semantic memory layer exists
- reusable constructs can be stored and recalled
- local-first routing can decide when external help is warranted
- an assist path can validate or expand an answer
- the refined answer can be learned back locally
- compact benchmark prompts can preserve construct identity
- repeated local recall can be dramatically faster than a full LLM round-trip

This is not just a theory sketch anymore.
It is a working proof of concept with a benchmark method and test coverage around the claim.

---

## Limitations

This is still a prototype, and the limits matter.

Current limitations include:

- small benchmark sample size
- prompt-specific results
- variable LLM timing due to network, provider latency, and model routing
- API assist calls still send more context than a final optimized build should
- local memory quality depends on how well constructs are taught
- the benchmark is not yet a standardized harness

These limits do not erase the signal.
They define the next engineering steps.

---

## Near-Term Roadmap

Planned next steps:

- reduce OpenAI assist payload size
- add benchmark history logging
- expand regression coverage for benchmark history and payload size
- continue cleaning legacy provenance values
- add more seeded example domains beyond sound and portrait lighting
- further demonstrate that Subjectspace is truly subject-agnostic

---

## Quick Start

### Install

```bash
npm install
```

### Run the app

```bash
npm run dev
```

### Run tests

```bash
npm test
```

---

## Repository Layout

```text
.
├─ README.md
├─ docs/
│  └─ whitepaper.md
├─ src/
└─ tests/
```

---

## Core Thesis

Strandspace is built on one central idea:

> When meaning can be reactivated from a learned construct, the system should recall locally first and spend external tokens only when the local field is not yet sufficient.

That is the heart of the project.

---

## White Paper

For the longer technical write-up, see [docs/whitepaper.md](docs/whitepaper.md).
