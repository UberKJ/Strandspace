# Strandspace Studio

Strandspace Studio is a local-first memory and skill layer for agents.

It stores reusable constructs, recalls them from partial cues, and only escalates to an LLM when local confidence is too low. The goal is not to replace AI. The goal is to reduce repeated token usage, reduce unnecessary LLM communication, and make specialized agent behavior more reusable over time.

## What Strandspace is

Strandspace is a structured recall system for repeated domain work.

Instead of rebuilding the same answer from scratch every time, Strandspace stores a reusable construct made of:

- subject
- target
- objective
- context
- steps
- notes
- tags

When a user asks a related question later, Strandspace tries to reactivate the closest construct from partial natural-language cues.

## What Strandspace is not

Strandspace is not:

- a replacement for LLMs
- a foundation model
- a vector database
- a generic document search engine

It is a local-first recall and composition layer that can sit under agents, copilots, and domain-specific assistants.

## Why it exists

Many agent systems keep paying the same reasoning cost over and over.

They repeatedly send long prompts, markdown memory files, or broad context windows even when the task is familiar. Strandspace is built to make repeated work cheaper by turning domain knowledge into reusable local constructs.

That makes it useful for things like:

- specialist agents
- live sound and karaoke workflows
- field procedures
- repeated troubleshooting tasks
- voice assistants where latency matters
- future agent frameworks that need compact skill memory

## Current app surfaces

Strandspace Studio currently has two operating modes:

- `Subjectspace` for general-purpose knowledge capture and recall
- `Soundspace` for mixer, venue, and event setup memory

Music engineering is the first seeded subject, but the core recall flow is generic.

## Core behavior

Strandspace currently supports:

- storing reusable constructs with structured fields
- recalling the closest construct from partial prompts
- local-first routing
- OpenAI validation or expansion only when the local match is close enough
- learn-back workflows, where refined answers can be saved into local memory
- benchmark comparison between local recall and LLM round-trip timing

## Architecture in plain English

The system is built around a simple idea:

1. Teach a construct once
2. Recall it later from compact cues
3. Use the LLM only when local recall is uncertain
4. Save the improved result back into memory

This allows stable repeated tasks to become faster and cheaper over time.

## Example use case

A user teaches a mixer setup such as:

- subject: Soundspace
- target: small-room lead vocal
- objective: clear vocal with controlled feedback
- context: Yamaha MG10XU, small club, karaoke
- steps: gain staging, EQ moves, effects choices
- notes: watch upper mids, keep delay light
- tags: vocal, karaoke, small room

Later, a prompt like:

`Recall small-room lead vocal`

can reactivate that construct without rebuilding the setup from scratch.

## Why test it inside agents

Strandspace is designed to fit under agent workflows.

A useful test is not “can it answer a question?” but:

“Can the same agent use less context, fewer tokens, and fewer LLM calls when Strandspace is used as the local memory layer?”

That makes Strandspace a candidate for integration with agent systems, plugin-based assistants, and local-first specialist tools.

## Run locally

```bash
npm install
npm run dev
