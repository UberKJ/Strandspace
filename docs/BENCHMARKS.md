# Strandspace Benchmarks

This document records benchmark methodology, current results, limitations, and falsification attempts for Strandspace local-first construct recall.

Strandspace is designed to make repeated known work cheaper and faster by recalling learned constructs locally before routing to an external model.

---

## Summary

Benchmarks should answer five practical questions:

1. How fast is local recall?
2. How does recall behave as construct count grows?
3. Where does the current design degrade?
4. When does indexed SQL become useful?
5. Does compact prompting preserve construct identity?

The current evidence supports a narrow claim: for repeated, well-taught, domain-specific work, local construct recall can be dramatically cheaper than rebuilding an answer through an external model.

This document should be updated whenever benchmarks are rerun. Prefer p50, p95, and p99 latency where available instead of averages alone.

---

## Environment

Record the environment for each benchmark run.

| Field | Value |
|---|---|
| Date | April 30, 2026 for the current scaling run |
| Machine | To be recorded per run |
| CPU | To be recorded per run |
| RAM | To be recorded per run |
| OS | To be recorded per run |
| Node version | To be recorded per run |
| SQLite/runtime | To be recorded per run |
| Browser or Node | To be recorded per run |
| External model, if used | To be recorded per run |
| Network conditions, if relevant | To be recorded per run |

Benchmarks are only useful if they can be repeated. Hardware, runtime, model, and warmup details matter.

---

## Test 1: Local Recall Baseline

The local recall engine is optimized for focused subjects running on a laptop, desktop, or small local server with SQLite.

The current recall flow is:

```text
deriveStrands -> normalizeConstruct -> buildNeedles -> scoreConstruct
```

The engine uses weighted token overlap and strand scoring. It does not depend on embeddings, vector search, or external network calls.

Future baseline runs should record:

- construct count
- subject count
- query count
- query generation method
- whether timing includes load, parse, scoring, ranking, and top-match return
- whether warmup runs were discarded
- p50, p95, and p99 latency

| Constructs | Subjects | Queries | p50 ms | p95 ms | p99 ms | Avg ms | Notes |
|---:|---:|---:|---:|---:|---:|---:|---|
| To be rerun | To be rerun | To be rerun | TBD | TBD | TBD | TBD | Add stable baseline run |

---

## Test 2: Multi-Subject Scaling

Multi-subject isolation is one of Strandspace's main scale strategies. The engine performs recall inside the active subject instead of forcing unrelated domains to compete in every query.

Extensive Monte Carlo simulations mirroring the `computeSupport()` logic, readiness threshold behavior, and learn-back behavior produced the following results from 4,000+ queries per configuration:

| Subjects | Constructs per subject | Total constructs | Growth factor | Avg latency ms | Local recall hit % |
|---:|---:|---:|---:|---:|---:|
| 5 | 500 | ~2,695 | 1.08 | 0.51 | 99.5 |
| 10 | 1,000 | ~10,190 | 1.02 | 0.72 | 99.4 |
| 10 | 2,500 | ~25,198 | 1.01 | 2.05 | 99.5 |

### Takeaways

- Local recall stayed under 2.1 ms even at more than 25,000 total constructs across 10 subjects.
- Learn-back growth was sub-linear in these simulations.
- Local hit rate converged to 99%+ in well-taught domains.
- Adding new subjects has minimal impact when recall remains subject-scoped.

### Caveat

These are simulation results. They are useful for direction and regression testing, but they should be paired with repeated runtime benchmarks on real hardware.

---

## Test 3: Single-Subject Stress Test

A fresh scaling benchmark was run on April 30, 2026 using a faithful Python port of the core Strandspace recall flow.

The test represented a worst case for the current local-first design: one active subject with a large number of constructs.

### Setup

- One active subject.
- Realistic recipe-style constructs with labels, targets, objectives, rich context objects, tags, and learned-count variation.
- 100 random queries per scale.
- End-to-end recall timing measured, including parse, scoring, ranking, and top-match return.
- Tested from 10,000 to 200,000 constructs.
- Existing scoring behavior only; no algorithm changes.

### Results

| Constructs | Strandspace linear scan | SQL server-style indexed backend | Notes |
|---:|---:|---:|---|
| 10,000 | 0.022 ms/query | 0.001 ms/query | Both feel instant |
| 50,000 | 0.031 ms/query | 0.001 ms/query | Strandspace still excellent |
| 100,000 | 0.078 ms/query | 0.001 ms/query | Matches observed local ~8 ms batch behavior |
| 200,000 | 0.152 ms/query | 0.002 ms/query | No crash or scoring failure |

### Findings

The benchmark showed no hard failure in the recall logic. Strand derivation, weighted token overlap, scoring, ranking, and trace behavior remained deterministic and stable through 200,000 constructs in one subject.

The main practical limit is not the scoring algorithm itself. The more likely constraints are browser or Node memory pressure, garbage collection, load time, and user-interface responsiveness when a single subject becomes very large.

---

## Practical Scale Envelope

| Per-subject size | Recommendation |
|---:|---|
| 1,000-15,000 constructs | Ideal local-first range |
| 15,000-50,000 constructs | Still strong; consider subject splitting if UX slows |
| 50,000-100,000 constructs | Works, but monitor memory and load behavior |
| 100,000-200,000 constructs | Technically viable; better suited to Node than browser |
| 200,000+ constructs | Consider PostgreSQL or another indexed backend |

---

## Test 4: External Model Comparison

This is the highest-value benchmark family because it tests Strandspace against the practical alternative: asking a local or hosted model to solve the same repeated task again.

Future runs should document:

- model name
- quantization, if known
- hardware
- prompt set
- number of runs
- match criteria
- local recall latency
- model latency
- token counts
- failure cases

| Prompt set | Local p50 | Local p95 | Model p50 | Model p95 | Match rate | Notes |
|---|---:|---:|---:|---:|---:|---|
| Ollama/local LLM comparison | TBD | TBD | TBD | TBD | TBD | Add repeatable run details |

### Methodology standard

A comparison is credible only if it records both timing and correctness. Local recall being faster is not meaningful if it recalls the wrong construct. LLM output being fluent is not meaningful if it fails the task-specific match criteria.

---

## Test 5: Compact Prompt Preservation

The compare route can generate shorter candidate prompts and accept one only if local recall proves that the shorter prompt reactivates the same construct.

The current benchmark flow is:

1. Start from the user question.
2. Generate shorter recall candidates from the matched construct.
3. Re-run local recall on those shorter candidates.
4. Accept a compact benchmark prompt only if it lands on the same construct.
5. Time local recall and external assist against that compact, semantically equivalent prompt.

Future runs should record:

| Original prompt | Compact prompt | Expected construct | Returned construct | Readiness/support | Result |
|---|---|---|---|---:|---|
| TBD | TBD | TBD | TBD | TBD | TBD |

---

## Test 6: Adversarial and Falsification Attempts

Strandspace should be tested against cases that could break local-first recall.

Useful adversarial cases include:

- ambiguous prompts
- overlapping constructs
- missing tags
- misleading cue words
- bloated subjects
- near-duplicate constructs
- unrelated subject collisions
- memory pollution after repeated learn-back

| Test | Expected risk | Result | Notes |
|---|---|---|---|
| Near-duplicate construct recall | Wrong local match | TBD | Add concrete cases |
| Overlapping tags across subjects | Subject bleed-through | TBD | Add concrete cases |
| Compact prompt identity preservation | Wrong construct after compression | TBD | Add concrete cases |
| Learn-back repetition | Memory pollution | TBD | Add concrete cases |

---

## Known Limitations

Current limitations:

- Benchmark samples are still narrow.
- Simulation results need repeated runtime confirmation.
- Local recall quality depends heavily on construct quality.
- External model timing varies by model, hardware, provider, and network conditions.
- Browser memory pressure matters at high construct counts.
- Very large single-subject collections should move toward indexed SQL candidate retrieval.
- Compact prompts need broader validation.
- Average latency alone is not enough; p50, p95, and p99 should be added.

Including limitations is part of the benchmark. Smooth benchmark stories are less credible than benchmark histories with texture, failure cases, and reproducible conditions.

---

## Falsification Conditions

The Strandspace thesis weakens if:

1. construct recall does not remain faster than local LLM inference for repeated known tasks at realistic scale
2. local recall frequently selects the wrong construct under normal variation
3. compact prompts fail to preserve construct identity
4. learn-back creates memory pollution faster than it improves recall
5. indexed candidate retrieval cannot preserve deterministic scoring behavior at larger scale
6. memory or load behavior makes the local-first path impractical in intended deployments

The goal is not to prove that Strandspace is always better than an LLM. The goal is to prove that repeated learned work can become cheaper, faster, and more dependable when the useful construct is recalled locally first.
