# Strandspace White Paper Summary

This is a lightweight companion to the full PDF white paper. It is meant to help contributors and evaluators understand the project quickly without reading the complete document first.

Full paper:

- [Project white paper PDF](../strandspace-white-paper.pdf)

## Core Idea

Strandspace treats useful knowledge as a reusable construct instead of a one-off chat answer. A construct captures:

- target
- objective
- context
- steps
- notes
- tags
- strands that help future recall

The goal is to make retrieval practical, editable, and cumulative.

## Why This Matters

Typical chat workflows often answer the current question well but do not reliably improve future recall. Strandspace shifts the emphasis from one-time generation to stored, queryable memory.

That makes it better suited for:

- recurring workflows
- technical setups
- venue or device presets
- field notes that should improve over time
- mixed human-and-LLM knowledge capture

## Strandspace Model

The white paper centers on a few principles:

1. Local-first recall should happen before model calls.
2. Learned knowledge should be structured enough to edit and compare.
3. Queries should return only the relevant portion of a stored construct when possible.
4. API assistance should refine or validate memory, not replace it.
5. A good system should keep working even when online services are unavailable.

## Subjectspace

Subjectspace is the general-purpose construct workspace. It lets a user:

- build a construct from notes
- save it under a subject
- search by partial cues
- recall an existing construct
- compare local recall with model-assisted output

This is the general memory layer.

## Soundspace / Music Engineer

Soundspace is the applied music-engineering layer. It focuses on:

- mixer settings
- microphone-specific setup details
- venue presets
- signal flow habits
- troubleshooting recall
- scene and show preparation habits

It is designed for the kind of practical setup memory that working engineers tend to rebuild repeatedly.

## Local-First With Optional Assist

OpenAI support is optional. When enabled, the app can:

- draft a construct from rough notes
- validate a narrow or uncertain recall
- refine a generated sound construct
- benchmark local recall against assisted output

When disabled, Strandspace continues to operate in local-only mode.

## Reliability Direction

The current implementation direction emphasized in the recent upgrade is consistent with the white paper:

- request timeouts prevent indefinite hangs
- graceful shutdown closes the server and SQLite database cleanly
- local recall remains available even when assist fails
- seeded examples make the system demonstrable without configuration friction

## What To Look For In A Demo

If you are evaluating Strandspace, the most important behaviors to notice are:

- how quickly local recall answers from stored constructs
- whether the app returns just the section the query asked for
- whether a vague query asks for clarification instead of bluffing
- whether new knowledge can be learned into the library and reused later
- whether the app remains useful with no API key at all

## Current Scope

Strandspace is not trying to be a full DAW, full documentation platform, or general autonomous agent. Its strength is structured recall for repeated practical knowledge.

That narrower focus is what makes the system legible, editable, and resilient.
