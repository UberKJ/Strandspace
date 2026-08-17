# Strandspace

**Local-first structured memory that turns repeated reasoning into reusable expertise.**

Strandspace is a working construct-memory engine that recalls useful learned structure from partial cues, verifies or expands it when necessary, and routes to larger AI only when local knowledge is not sufficient.

The long-term goal is simple:

> **Use powerful intelligence to discover what is new. Verify what is learned. Preserve useful expertise locally. Spend expensive intelligence again only when uncertainty returns.**

---

## Why It Matters

Large language models are extraordinarily capable, but many AI applications repeatedly resend the same context, preferences, examples, instructions, and previously solved information to large models.

That makes sense for genuinely new problems. It becomes increasingly inefficient after useful behavior has already been learned.

Strandspace explores a different loop:

**reason -> verify -> condense -> store -> reuse -> escalate on uncertainty**

The project asks whether repeated successful reasoning can progressively become cheaper to reactivate than novel reasoning.

This is not about eliminating frontier AI. It is about **spending intelligence where uncertainty actually exists**.

---

## Current Working Pattern

The current repository already demonstrates the foundation:

1. store a structured construct locally
2. recall it later from a related prompt
3. assess whether local memory is sufficient
4. route to AI when the match is thin, partial, or uncertain
5. save the improved result back into local memory
6. reuse or adapt the improved construct later

The existing routing modes include:

- `local_recall` — local memory is strong enough to use directly
- `api_validate` — local memory appears useful but needs validation
- `api_expand` — partial memory exists but additional reasoning is needed
- `teach_local` — evidence is too thin and another example should be learned

---

## What Strandspace Is Becoming

The next research direction extends construct memory into **verified local expertise**.

A useful construct should eventually carry more than content. It should be able to express:

- memory/learning strength
- provenance
- verification method
- trust state
- freshness or expiry policy
- lineage and versions
- estimated cost to create and recall

That lets an agent ask more useful questions than simply "Do I know this?"

> **What do I know, how do I know it, how current is it, and what is the cheapest responsible way to verify or use it?**

The desired compute hierarchy is:

1. deterministic rules or trusted local constructs
2. small/local models for familiar execution and adaptation
3. specialized models or agents when needed
4. frontier models for novel, difficult, or unresolved reasoning
5. verification and learn-back so the next encounter can begin lower in the hierarchy

---

## Personal Strandspace

A major next application is **Adaptive Personal AI**.

Instead of making a user's assistant synonymous with one LLM provider, the architecture separates:

### Model intelligence

Replaceable reasoning engines: local open models, specialized models, or frontier services.

### Personal Strandspace

User-owned durable knowledge such as preferences, capabilities, successful workflows, project state, trusted facts, learned adaptations, and permissions.

### Agents

Specialized workers that receive only the trusted context relevant to their responsibility.

A paperwork agent should not need live-sound knowledge. A coding agent should not need recipe memory. This **least-necessary-context** approach can reduce token cost, latency, privacy exposure, and irrelevant model context.

The personal assistant becomes:

**Personal Strandspace + agents + permissions + accumulated verified knowledge**

rather than a permanent dependency on one model vendor.

---

## Adaptive Personal AI for Human Capability

Disability is the first major proving ground for Personal Strandspace.

The design principle is not to begin with a diagnosis. It is to ask:

> **What is the person trying to accomplish, where is the friction, and what is the least burdensome way to bridge that gap?**

That friction can involve physical or motor ability, sensory access, cognition, communication, executive function, memory, attention, stamina, or combinations that do not fit one category.

The system should learn successful accommodations and preserve them as reusable local constructs.

An early target is paperwork and complex-document assistance: understanding what a document requires, remembering an ongoing matter, retrieving user-approved information, asking only for what is missing, preparing responses, preserving task state across interruptions, and escalating when fresh verification or stronger reasoning is required.

The goal is not an assistant for one disability. It is open infrastructure for growing a personal AI around the individual.

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

The expanded trust/provenance system, multi-tier local-model routing, personal capability profile, and accessibility adapters are **research direction**, not claims of already-shipped functionality.

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

## What This Is Not

Strandspace is not a vector database.

It is not an LLM wrapper.

It is not a claim to reproduce the human brain.

It is not a replacement for large language models.

Human learning and expertise inspire the design principle that repeated successful work should become cheaper to reactivate, but Strandspace should be evaluated as an engineering architecture through measurable results.

---

## Research Measurements

The expanded thesis creates concrete measurements:

- frontier escalation rate
- local completion rate
- context compression ratio
- tokens per completed task
- cost per completed task
- latency per completed task
- compute/energy per completed task where measurable
- construct reactivation accuracy
- verification failure rate
- stale-construct detection
- expertise formation: whether repeated verified execution reduces compute requirements without unacceptable quality loss

The central empirical question is:

> **Does repeated verified experience measurably reduce the computational cost of reliable task completion?**

---

## Evidence

Current scaling and benchmark details live in:

- [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md)

The current evidence supports the narrower shipped architecture:

- local recall is deterministic
- focused subjects remain fast at practical local-first sizes
- multi-subject isolation keeps unrelated domains from slowing each other down
- larger deployments can move candidate retrieval to indexed SQL while preserving the same scoring model

The new expertise, trust, and Personal Strandspace hypotheses require additional implementation and measurement.

---

## Design and White Paper

Architecture details:

- [`docs/DESIGN.md`](docs/DESIGN.md)

Expanded research thesis and Personal Strandspace direction:

- [`docs/whitepaper.md`](docs/whitepaper.md)

Roadmap:

- [`docs/ROADMAP.md`](docs/ROADMAP.md)

---

## Falsification Conditions

The project should change direction if evidence shows that:

- local reuse does not produce meaningful cost or latency advantages for repeated known tasks
- recall quality degrades unacceptably as memory grows
- verification costs erase the savings from reuse
- compact trusted context cannot preserve task identity
- learn-back pollutes memory faster than it improves expertise
- stale or contradictory knowledge cannot be detected reliably enough for responsible use
- small/local execution cannot reliably reduce frontier escalation

The architecture should be judged by measurable behavior, not analogy.

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

## License and Use Protection

Strandspace is licensed under the **MIT License**.

The user's accumulated personal intelligence should remain portable and user-owned rather than being locked to one model or provider.

The software is provided **as is**, without warranty of any kind. Health-oriented examples in this repository are software demonstrations and personal tooling patterns, not medical advice, diagnosis, or treatment.

See [`LICENSE`](LICENSE) for the full license text.

---

## In One Sentence

**Strandspace is a local-first structured memory architecture for turning repeated verified reasoning into reusable expertise and giving agents only the intelligence and context they actually need.**
