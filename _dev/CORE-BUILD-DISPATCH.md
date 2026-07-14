# Clean core-build dispatch

Use this file as the complete starting packet for a new Codex task. The task must contain no private world, personal knowledge-base content, employment context, or prior conversation transcript.

## Objective

Implement the smallest end-to-end slice:

```text
World Pack
→ deterministic retrieval
→ GPT-5.6 Responses Structured Output
→ hard validation
→ creator accept/edit/reject
→ versioned canon overlay
→ frozen replay
```

The existing app shell, contracts, fixture data, documents, and tests are groundwork. Inspect them before editing.

## Required outputs

1. Deterministic retrieval with stable ID ordering and evidence bundle.
2. Fixture provider plus live GPT-5.6 adapter using `text.format` strict JSON schema.
3. Typed refusal, timeout, API, configuration, and schema-error paths.
4. Hard validators for unknown entity, invalid/deceased state, time, missing location path, character knowledge, inactive or conflicting tradition, unsupported claim, and unapproved expansion.
5. One-page UI that runs the grounded, living-Hector, knowledge-leak, and red-sail proposal cases.
6. Creator accept/edit/reject against a base canon version, with deterministic hash and stale-decision rejection.
7. Frozen replay before and after an approved change.
8. Sanitized evidence artifacts separating fixture from live results.
9. Unit, integration, replay, and browser smoke tests.

## Constraints

- Use the existing Next.js/TypeScript stack.
- Use GPT-5.6 through the Responses API. Start with `gpt-5.6`, `reasoning.effort: medium`, and Structured Outputs.
- Do not add function calling, PTC, graph DB, embeddings, login, collaboration server, multi-agent runtime, general-purpose editor, or private data.
- Do not create a public README while the evidence-skill source manifest is stale.
- Never call fixture output live GPT-5.6 evidence.
- Never let blocked output or an unapproved proposal update canon.
- Keep raw prompts, keys, personal paths, private session details, and `/feedback` IDs out of Git.

## Test invariants

- same retrieval input → byte-stable ordered JSON
- unregistered entity → `entity_unknown`
- Hector alive in the Ithaca state → blocked
- Penelope asserts the Ogygia fact → `belief_scope_violation`
- both Helen traditions active without a resolution → creator decision
- proposal before approval → canon version and hash unchanged
- reject → unchanged; edit → only edited patch applied
- approval against stale base version → `stale_decision`
- safe approval → prior frozen cases retain their expected outcomes
- refusal is not reported as schema failure
- missing API key is a typed configuration error
- fixture trace has no actual model or response ID

## Verification and evidence

Run `npm run verify`, inspect the app in a real browser, and record changed files, test counts, build result, remaining risks, and sanitized live-call metadata. Do not claim user value or production readiness.

After the core functionality is genuinely complete, invoke `/feedback` in this same clean task and store the returned session ID only in a gitignored private submission record and Devpost. Do not add it to source, docs, commits, screenshots, or the demo video.
