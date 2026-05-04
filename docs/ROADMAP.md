# Strandspace Roadmap

This roadmap separates shipped behavior, near-term documentation and engineering priorities, medium-term platform work, and deliberate non-goals.

Strandspace is an active prototype and platform lab. The roadmap should stay practical, testable, and honest about limitations.

---

## Current Status

Shipped or currently represented in the repository:

- local-first construct recall
- subject-based memory isolation
- SQLite-backed persistence
- deterministic strand/token-overlap scoring
- routing modes for local recall, validation, expansion, and local teaching
- optional OpenAI-assisted routes
- learn-back flows for saving improved constructs
- DiabeticSpace recipe recall and adaptation
- Strandspace Studio for general construct teaching and recall
- Soundspace for repeated live-sound and karaoke setup workflows
- automated test suite covering core recall, routing, app behavior, and scaling simulations

---

## Near-Term Priorities

### 1. Keep documentation split by reader type

The README should remain the front door, not the whole project history.

- README: short overview and links
- DESIGN: architecture and routing
- BENCHMARKS: methodology, results, caveats, falsification attempts
- ROADMAP: shipped work, next work, non-goals
- whitepaper: deeper argument and theory

### 2. Improve benchmark history logging

Benchmarks should become repeatable records rather than one-off notes.

Add or improve logging for:

- benchmark date
- machine/runtime
- construct count
- subject count
- query set
- p50/p95/p99 latency
- external model comparison details
- failure cases

### 3. Add p95 and p99 latency reporting

Average latency is not enough. Tail latency matters for real product behavior.

Benchmark reports should include:

- p50
- p95
- p99
- average
- maximum
- failure rate or mismatch rate

### 4. Reduce external assist payload size

The local-first design becomes more valuable when the system sends less unnecessary context outward.

Priorities:

- compact prompts that preserve construct identity
- smaller validation payloads
- clearer separation between local answer, validation request, and expansion request
- benchmarked token reduction

### 5. Strengthen variant lineage

Variant memory is one of the most practical product advantages of Strandspace.

Add clearer lineage for:

- original construct
- adapted construct
- saved variant
- user edits
- AI-assisted changes
- learned-count changes

### 6. Polish one app into a clearer user-facing product

The repository currently demonstrates multiple app surfaces. The next product step is to make one app surface feel complete enough for outside users to understand without explanation.

Good candidates:

- DiabeticSpace, because recipes and adaptations are easy to understand
- Soundspace, because repeated setup workflows clearly fit construct memory
- Strandspace Studio, because it exposes the generic engine

---

## Medium-Term Priorities

### 1. Add indexed SQL backend option

SQLite should remain the local-first default, but larger deployments need an indexed backend path.

The goal is not to replace deterministic scoring. The goal is to fetch better candidate sets before applying the same scoring logic.

Potential indexed fields:

- subject
- strands
- tags
- context anchors
- learned count
- provenance
- updated time

### 2. Improve trace inspection

Users and developers should be able to see why a construct was selected.

Trace inspection should expose:

- derived strands
- matched needles
- winning construct
- competing constructs
- score breakdown
- routing decision
- readiness/trust state

### 3. Add memory quality tools

Local recall quality depends on construct quality.

Useful tools include:

- duplicate construct detection
- near-duplicate warning
- weak construct detection
- stale construct review
- subject split suggestions
- low-confidence recall review queue

### 4. Expand adversarial benchmark cases

The system should be tested against realistic failure modes.

Cases to add:

- ambiguous prompts
- overlapping constructs
- misleading cue words
- cross-subject collisions
- near-duplicate constructs
- memory pollution through repeated learn-back
- compact prompts that accidentally shift identity

### 5. Separate platform and app concerns more clearly

The repo currently contains both engine and app surfaces.

Future cleanup should clarify:

- reusable engine code
- app-specific code
- shared API patterns
- domain-specific adapters
- benchmark code
- product UI code

---

## Deliberately Out of Scope

Strandspace is not currently trying to be:

- a general chatbot
- a vector database
- a replacement for LLMs
- a medical advice system
- a general artificial intelligence claim
- a universal memory solution for every kind of knowledge

These non-goals matter because they keep the project testable. Strandspace should be evaluated on repeated structured work, not on broad open-ended reasoning.

---

## Falsification Conditions

The project thesis should be reconsidered if:

- local recall stops outperforming local LLM inference for repeated known tasks
- recall accuracy degrades sharply as construct count grows
- compact prompts cannot preserve construct identity
- learn-back causes memory pollution faster than it improves reuse
- deterministic scoring cannot survive indexed backend migration
- memory or load behavior makes local-first deployment impractical for intended domains

A serious project should say what would prove it wrong. These conditions are not weaknesses; they are part of making Strandspace testable.

---

## Longer-Term Possibilities

Future domains could use the same construct-memory pattern when the work repeats with small variations.

Possible directions:

- robotics task memory
- caregiver workflow memory
- home operations memory
- music production workflow memory
- animation movement constructs
- specialized troubleshooting assistants
- personal project memory

Each future domain should be evaluated by the same test: does repeated learned work become cheaper, faster, and more dependable after useful constructs are stored locally?
