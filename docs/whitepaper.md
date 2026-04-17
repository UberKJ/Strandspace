# Strandspace Studio White Paper

**Updated April 15, 2026**

**Query-triggered semantic recall with compact prompt benchmarking**

> Store the pieces. Store the triggers. Store the rules that let meaning form.

---

## Executive Summary

Strandspace Studio is a working prototype for domain-specific recall. Instead of treating every answer as a fresh retrieval problem, it stores reusable constructs that can be reactivated from partial cues.

The current build centers on:

- a generic **Subjectspace** memory layer
- a seeded **Soundspace** domain layer for music engineering

The prototype is built around a simple claim:

> Repeated work should become cheaper after the system has already learned the right construct.

Local Strandspace recall should answer stable, repeated prompts faster than an LLM round-trip, while the LLM path should be reserved for validation, expansion, or gaps that the local field cannot settle confidently.

As of April 15, 2026, the current implementation shows three concrete results:

- the automated regression suite passes **11 of 11 tests**
- the benchmark path compacts the user prompt before timing the LLM route, but only when the shorter prompt can be proven to recall the same construct locally
- live runs continue to show the same directional outcome: local recall is substantially faster than the LLM assist round-trip on repeated prompts, while compact prompting lowers the user-query token burden further

---

## Abstract

Strandspace Studio is a query-triggered semantic recall framework for reusable local memory.

A query is treated as an activation event rather than a generic text search.

- **Trigger strands** identify the task
- **Anchor strands** narrow the domain
- **Composite constructs** carry reusable working knowledge
- the **expression field** emits a temporary answer only when a stable construct is available

The current product includes two implementation surfaces:

### Subjectspace

A generic, user-adaptable memory system where a person can teach any subject by storing:

- construct label
- target
- objective
- context
- steps
- notes
- tags

### Soundspace

A seeded application layer that demonstrates the same pattern in live sound and music-engineering setups.

When local evidence is strong enough, Strandspace answers directly. When the match is narrow or incomplete, the system can route to an OpenAI assist path for validation or expansion and then learn the refined result back into local memory.

---

## 1. Problem Statement

Most AI assistants still solve repeated domain questions by paying the same broad retrieval cost over and over.

They search flat text, large prompt payloads, or general embeddings each time, even when the user keeps asking about the same underlying setup.

That approach is flexible, but it has three recurring drawbacks:

- it does not preserve reusable working structure well
- it often re-sends more context than the current question actually needs
- it makes repeated domain recall slower and more expensive than it has to be

Strandspace addresses that problem by shifting from **answer everything from scratch** toward **reactivate a learned construct when the evidence is strong enough**.

It does not claim to replace LLMs.
It claims that a local semantic memory layer can carry the stable parts of repeated work, while the LLM path remains available for uncertainty, validation, or expansion.

---

## 2. Architectural Model

The current architecture includes:

- **Trigger strands** that identify intent such as recall, compare, or assist
- **Anchor strands** that narrow the active region of meaning
- **Composite constructs** that stabilize reusable knowledge such as a vocal setup, interview lighting setup, or host-forward music bingo scene
- an **expression field** as the temporary workspace where the current answer forms
- **stabilized memory** as the learned local construct that can be reactivated later with lower effort

The system does not store every possible phrasing of an answer.
It stores a reusable construct and the cues that can reactivate it.

---

## 3. Current Product Architecture

### 3.1 Subjectspace

A stored construct currently includes:

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

The recall pipeline parses a prompt, scores stored constructs against the active cues, and emits a stable answer only when the winning construct crosses the readiness threshold.

If the match is weaker, the system can recommend another local example first, or route to API assistance.

### 3.2 Soundspace

Soundspace is the first seeded applied domain.
It demonstrates that the same memory pattern can serve music engineering and live sound work, including:

- microphone gain staging
- karaoke rotation presets
- host-forward music bingo scenes
- other repeatable setup patterns

This domain matters because it is exactly the kind of work that repeats with small variations. A host mic setup, a small-room lead vocal scene, or a monitor strategy often needs refinement, not reinvention.

### 3.3 Routing Logic

The current local routing modes are:

- `local_recall`: the construct is stable enough to answer directly
- `api_validate`: local recall is usable, but the match is narrow or contested
- `api_expand`: the system found partial recall, but not enough to trust without help
- `teach_local`: local memory is too thin to justify expansion yet

This matters because the product does not use an external API by default.
The system first asks whether local memory is already sufficient.

### 3.4 Learn-Back Loop

1. Local recall attempts to answer
2. API assist is used only when the local route says it is warranted
3. The validated construct is optionally learned back into local memory
4. Future prompts can recall the refined construct faster

---

## 4. Compact Benchmark Prompting

One of the most important recent changes is the benchmark rewrite.

The compare route no longer assumes that the original long user question is the fairest benchmark input for the LLM path.
Instead, it now generates shorter candidate prompts and accepts one only if the system can prove locally that the shorter prompt reactivates the same construct.

The benchmark flow is now:

1. Start from the user question
2. Generate shorter recall candidates from the matched construct
3. Re-run local recall on those shorter candidates
4. Accept a compact benchmark prompt only if it lands on the same construct
5. Time local recall and the LLM assist route against that compact, semantically equivalent prompt

This change matters because it asks whether Strandspace can compress the working cue set while preserving recall identity.

---

## 5. Current Validation Status

The active automated regression suite passed **11 of 11 tests** on April 15, 2026.

The current suite covers four areas:

### App shell and routing surface

- serves the Strandspace Studio interface
- serves the standalone Soundspace interface
- exposes seeded subject lists correctly

### Subjectspace local memory

- stores and recalls a custom construct
- routes narrow-but-ambiguous recall toward API validation
- reports assist status correctly when the API key is unavailable
- confirms that compact benchmark prompting still recalls the same construct while showing Strandspace faster than the mocked LLM round-trip
- returns an OpenAI-backed draft that can be saved back into local memory

### Soundspace seeded retrieval

- recalls a seeded mixer setup
- stores a new sound construct for later recall
- generates and stores a missing sound construct on demand

### Database and cleanup behavior

- test runs use temporary SQLite databases
- live cleanup removed stale test-created portrait-lighting subjects from the production data store
- the fallback database selector now avoids accidentally preferring backup or test databases when the main file is unavailable

---

## 6. Current Findings

### 6.1 Live benchmark capture

A captured benchmark run reported:

- original prompt: about **23 estimated tokens**
- benchmark prompt: about **8 estimated tokens**
- estimated prompt savings: **15 tokens**
- local Strandspace recall: **4.590 ms**
- LLM assist round-trip: **3388.3 ms**
- observed speedup: **738.2x** in favor of local recall

In the interface, the local path is labeled **Strandbase recall**. That label refers to the local Strandspace memory route, not to a separate architecture.

### 6.2 Fresh live verification after the benchmark rewrite

A second live verification under the Portrait Lighting subject produced:

- original prompt: about **41 estimated tokens**
- compact benchmark prompt: about **9 estimated tokens**
- same construct confirmed locally before timing
- estimated prompt savings: **32 tokens**
- local Strandspace recall: **0.388 ms**
- LLM assist round-trip: **5462.432 ms**
- total LLM usage reported by the API: **1799 tokens**

This matters because it confirms the same pattern under a different subject.

### 6.3 Important interpretation note

Prompt savings and total LLM usage are not the same thing.

The compact benchmark prompt shortens the user-query portion of the LLM request. However, the current API assist call still includes routing data and a local recall snapshot. That means the LLM can still consume a large number of total tokens even when the user prompt itself has been compressed successfully.

This is an engineering finding, not a contradiction.

It means:

- Strandspace is already reducing the user-side recall cue set
- the current LLM assist packaging still carries more context than the minimum possible
- a future optimization pass should reduce assist payload size further, especially when the local winning construct is already known

---

## 7. Why These Results Matter

The current results do not claim that every question in every domain should bypass an LLM.
They support a narrower and more practical conclusion:

- when the system has already learned a reusable construct, local recall is extremely cheap
- compact prompting can preserve construct identity with fewer user-query tokens
- the real economic opportunity is not just answering faster, but routing less work outward
- the product now has automated coverage around the exact flows that define this claim

---

## 8. Limitations

The current prototype still has important limits:

- the benchmark sample size is small and prompt-specific
- LLM timing varies with network, provider latency, and model routing
- the current assist call still sends more context than a final optimized version should
- local memory quality depends on how well the user teaches the construct
- the product is still a prototype, not a fully standardized benchmark harness

These constraints do not weaken the core result, but they do define the next engineering work clearly.

---

## 9. Near-Term Roadmap

The next practical steps are:

- reduce the OpenAI assist payload so that prompt compaction produces larger end-to-end token savings, not only query-side savings
- add benchmark history logging so repeated runs can be analyzed over time rather than one screen at a time
- expand the regression suite with benchmark-history and payload-size assertions
- continue cleaning residual legacy provenance values from stored constructs
- add more seeded example domains beyond music engineering and portrait lighting to demonstrate that Subjectspace really is subject-agnostic

---

## 10. Conclusion

Strandspace Studio now represents a clearer and more defensible proof of concept than the earlier prototype.

The active system has:

- a generic memory layer that can adapt to arbitrary subjects
- a seeded sound-engineering domain that demonstrates concrete utility
- local-first routing with controlled API escalation
- a compact benchmark prompt selector that preserves construct identity
- an 11-test regression suite aligned with the current product
- live evidence that repeated local recall can be dramatically faster than an LLM round-trip

The central claim of Strandspace remains the same, but it is now supported by better implementation evidence:

> When meaning can be reactivated from a learned construct, the system should recall locally first and spend external tokens only when the local field is not yet sufficient.

---

## Appendix A: Current Regression Suite Snapshot

- `GET /` serves Strandspace Studio
- `GET /soundspace` serves the standalone Soundspace app
- `GET /api/subjectspace/subjects` exposes seeded subject fields
- `POST /api/subjectspace/learn` stores and recalls a custom construct
- Subjectspace routes ambiguous recall toward API validation
- `GET /api/subjectspace/assist/status` reports disabled mode without an API key
- `POST /api/subjectspace/compare` verifies compact benchmark prompting and Strandspace speed advantage
- `POST /api/subjectspace/assist` returns an OpenAI-backed draft that can be saved
- `GET /api/soundspace` recalls a seeded mixer setup
- `POST /api/soundspace/learn` stores a new sound construct for later recall
- `POST /api/soundspace/answer` generates and stores a missing construct
