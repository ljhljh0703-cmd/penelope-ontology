# Architecture

## Design rule

The language model proposes. Deterministic code decides whether the proposal is eligible to reach the creator or canon.

```text
UI / POST /api/runs
        │
        ▼
Application orchestration ── sanitized evidence log
        │
        ├─ deterministic retrieval ── World Pack + canon overlay
        │
        ├─ NarrativeModel port
        │      ├─ fixture adapter
        │      └─ GPT-5.6 Responses adapter
        │
        ├─ hard validators
        │      ├─ entity and state
        │      ├─ time and location
        │      ├─ character knowledge
        │      ├─ active tradition and support
        │      └─ expansion approval
        │
        └─ creator decision → versioned overlay → frozen replay
```

## Deterministic core

Pure TypeScript functions will own:

- World Pack validation
- claim and graph-neighbor retrieval
- stable scoring and ID tie-breaking
- hard validation
- proposal acceptance, edit, and rejection
- canon hashing and version transitions
- replay comparison

The same inputs must produce byte-stable JSON. Wall-clock time, random values, network calls, and UI state stay outside this boundary.

## Model boundary

The live adapter will use:

- Responses API
- model request `gpt-5.6` (the alias currently routes to `gpt-5.6-sol`)
- `reasoning.effort: medium` as the initial measured baseline
- Structured Outputs through `text.format`
- a strict JSON schema with all object fields required and `additionalProperties: false`

The model does not need tools for this bounded generation step. Function Calling and Programmatic Tool Calling are deliberately excluded from the MVP.

The adapter must separately handle completed output, refusal, timeout, API error, and schema failure. Requested model, actual response model, response ID, and token usage are recorded in sanitized run metadata. Keys and raw private prompts are never recorded.

## World Pack

The pack contains layers, sources, entities, claims, events, rules, belief profiles, fixed states, canon profiles, an expansion policy, and replay case IDs.

Claims are the atomic provenance unit. Relations are derived from claims rather than stored twice. Conflicting traditions remain separate; confidence scores do not silently choose one. An unresolved active conflict returns `needs_creator_decision`.

Creator canon is an additive overlay. Replacing a source claim requires an explicit `supersedes` relation in a future schema revision; the scaffold does not yet implement this transition.

## Retrieval plan

For the small demo pack, deterministic retrieval scores:

- exact entity mention
- predicate and keyword overlap
- one-hop claim relationships
- fixed state and phase match
- active canon layer

Ties sort by stable ID. A graph database and embeddings add cost without proving the MVP claim, so they are deferred until multiple large packs create a measured recall problem.

## Run states

Every run ends in exactly one state:

- `passed`
- `blocked`
- `needs_creator_decision`
- `refused`
- `error`

A blocked draft may be displayed as an untrusted candidate for diagnosis, but it is never treated as valid output or written to canon.

## Planned HTTP contract

`POST /api/runs` accepts a world-pack ID, canon version, intent, prompt, fixed state, location, and focal characters. It returns retrieved evidence, structured draft, hard violations, proposals, and a fixture/live model trace.

Creator decisions and overlay persistence remain local for the MVP. Browser storage plus JSON export avoids a server database and authentication surface.

## Evidence gates

- CI: lint → typecheck → unit and replay tests → production build
- manual live gate: GPT-5.6 response metadata plus sanitized result
- expression gate: browser trace and screenshot after the vertical slice exists
- privacy gate: no keys, private IP, personal paths, raw chats, or feedback session IDs
