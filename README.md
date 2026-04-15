# Strandspace Studio

Strandspace Studio is a local-first recall workspace for storing reusable constructs and recalling them from partial cues.
The current app is focused on two operating modes:

- `Subjectspace` for general-purpose knowledge capture and recall
- `Soundspace` for mixer, venue, and event setup memory

Music engineering is seeded as the first subject, but the root flow is generic. Add a new subject once, teach a construct with context and steps, and Strandspace can recall it later without rebuilding the answer from scratch each time.

## What the app does

- Stores reusable subject constructs with target, objective, context, steps, notes, and tags
- Recalls the closest construct from partial natural-language prompts
- Routes borderline recalls toward OpenAI validation or expansion only when local memory is close enough
- Compares local Strandbase recall speed against the LLM round-trip for the same prompt
- Keeps a standalone Soundspace surface for live-audio setup recall

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The main app is at `/` and the sound workflow is at `/soundspace`.

## Test

```bash
npm test
```

## Notes

- Local runtime state is stored in SQLite and is ignored by Git.
- `OPENAI_API_KEY` enables live assist and benchmark comparisons when available.
- Legacy local data can still be reused if an older database is present.
