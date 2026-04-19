# Contributing to Strandspace

Strandspace is designed to stay local-first, simple to run, and easy to improve without rewriting the app architecture. This guide keeps contributions aligned with that goal.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the sample environment file:

```bash
cp .env.example .env
```

3. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment Notes

- `OPENAI_API_KEY` is optional.
- Without an API key, Strandspace runs in local-only mode.
- `STRANDSPACE_DB_PATH` is optional and defaults to `data/strandspace.sqlite`.
- `STRANDSPACE_LOG_LEVEL` is optional and defaults to `info`.
- The server logs the selected DB path and whether OpenAI assist is enabled at startup.

## Useful Scripts

```bash
npm run dev
npm run start
npm run test
npm run clean
npm run dataset:health
npm run dataset:clean
npm run kill
npm run restart
```

- `clean` removes the local SQLite database files and common local server logs.
- `dataset:health` audits stored constructs and the packaged seed files for release readiness.
- `dataset:clean` safely normalizes stored constructs and repairs broken related IDs.
- `kill` stops project-related `node` or `npm` processes.
- `restart` runs the kill helper and starts the dev server again.

## Development Expectations

- Keep the current architecture intact unless a change truly requires otherwise.
- Prefer focused fixes over broad rewrites.
- Preserve the existing routes and core behavior.
- Keep local-only behavior working even when OpenAI is unavailable.
- Add or update tests when changing request handling, persistence, recall behavior, or seeded examples.

## Testing

Run the full suite with:

```bash
npm test
```

The test runner covers:

- route availability
- local recall behavior
- seed/reset behavior
- timeout handling
- assist fallbacks
- music-engineering and subjectspace learning flows

## Demo Data

The UI includes a `Reset with Examples` action that restores the bundled examples for both subjectspace and the music-engineering memory set. Use that when verifying seeded demos or reproducing UI behavior.

The repo also includes `data/release-subject-seeds.json`, a cleaner future-release starter pack that demonstrates broader subjects such as Python engineering and accounting coding.

## Docs

- Main overview: [README.md](./README.md)
- Backend workspace guide: [docs/backend-workspace.md](./docs/backend-workspace.md)
- Dataset health guide: [docs/dataset-health.md](./docs/dataset-health.md)
- Theory guide: [docs/THEORY_OF_STRANDSPACE.md](./docs/THEORY_OF_STRANDSPACE.md)
- White paper PDF: [strandspace-white-paper.pdf](./strandspace-white-paper.pdf)
- White paper summary: [docs/white-paper-summary.md](./docs/white-paper-summary.md)

## Pull Requests

- Keep PRs focused and easy to review.
- Include a short summary of user-facing impact.
- Mention any new scripts, environment variables, or migration behavior.
- Call out known limitations if a fix is intentionally partial.
