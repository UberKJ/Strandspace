# Dataset Health and Release Prep

Strandspace now includes a lightweight dataset audit and clean workflow so the local memory field can stay useful as it grows into a learning chatbot.

## What It Checks

The dataset health pass audits stored `subject_constructs` and reports:

- release-readiness score
- average construct relevance score
- missing target, objective, steps, tags, context, and notes
- low semantic-anchor variety
- broken `relatedConstructIds`
- duplicate construct labels within a subject
- thin constructs that are likely to underperform in local recall

Each construct also exposes a relevance summary with:

- score
- status (`strong`, `usable`, or `thin`)
- anchor phrases
- coverage counts for context, steps, tags, strands, and related constructs
- repair hints

## API Routes

- `GET /api/subjectspace/dataset/health?subjectId=...`
- `POST /api/subjectspace/dataset/clean`

`/api/subjectspace/dataset/clean` performs a safe normalization pass:

- trims and deduplicates array fields
- removes broken related construct references
- refreshes links, strands, and binder-derived relations
- preserves the existing local-first construct records instead of rebuilding the database

## CLI Scripts

```bash
npm run dataset:health
npm run dataset:clean
```

Optional subject filter:

```bash
node scripts/dataset-health.js --subject=accounting-coding
node scripts/dataset-clean.js --subject=python-engineering
```

## Release Seed Packs

Two seed datasets now matter:

- `data/subject-seeds.json`: the active app starter pack
- `data/release-subject-seeds.json`: a cleaner future-release pack for broader domain demos

The release pack includes examples for:

- music engineering
- Python engineering
- accounting coding

That release pack is meant to demonstrate Strandspace’s long-term value: a local system can start with strong starter constructs, learn from repeated work, and gradually reduce unnecessary LLM calls because more domain memory is already structured locally.

## Why This Matters

The long-term chatbot direction is not “store every answer.” It is:

1. store reusable constructs
2. score and repair weak memory
3. enrich the local field as real work happens
4. recall known patterns quickly before escalating to a model

That is the same path whether the subject is music engineering, accounting software, Python service design, or another specialized domain.
