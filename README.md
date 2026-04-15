# Strandspace Studio

Strandspace Studio is a local-first recall system for turning repeated workflows into reusable memory constructs.
It started with gardening and sound workflows, and now includes a generic subject-memory layer seeded for music engineering.

The core idea is simple:

1. Teach a construct once.
2. Recall it later from partial cues.
3. Use an LLM only when local memory is close but not quite complete.
4. Learn the validated result back into Strandspace.

## What this app includes

- Strand-based recall for plants and gardening workflows
- `Soundspace`, a focused recall interface for mixer and live-audio setups
- `Subjectspace`, a reusable subject-memory engine for any domain
- A music-engineering seed library for recalling settings, scenes, and working patterns
- OpenAI assist routing for validation and expansion when local recall is uncertain
- A benchmark panel that compares local Strandbase recall against the LLM round-trip
- SQLite-backed local memory and learning state

## Subjectspace flow

The generic subject-memory layer works like this:

1. Save a construct with:
   - subject
   - construct label
   - target
   - objective
   - context
   - steps
   - notes
   - tags
2. Ask a recall prompt in natural language.
3. Strandspace scores the stored constructs and decides whether:
   - local recall is stable
   - local recall should be API-validated
   - partial recall should be expanded
   - a new construct should be taught first
4. If API assist is used, the returned draft can be saved back into local memory.

## Benchmarking

The main UI includes a benchmark panel that measures:

- local Strandbase recall latency
- LLM assist round-trip latency
- delta and speedup for the same prompt

This keeps the tradeoff visible while you build the recall field.

## Run locally

```bash
npm install
npm run dev
```

Then open the local server shown in the terminal, usually [http://localhost:3000](http://localhost:3000).

## Test

```bash
npm test
```

## Notes

- Local secrets such as `.env*`, shell startup files, logs, and SQLite transient files are ignored and should not be committed.
- `OPENAI_API_KEY` is only used for live assist and benchmark comparisons when available.
