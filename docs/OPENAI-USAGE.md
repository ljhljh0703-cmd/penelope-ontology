# OpenAI and Codex usage plan

## Role split

The user owns product direction, original style constraints, scope acceptance, canon decisions, subjective prose judgment, and final submission. Codex creates the contracts, deterministic core, UI, tests, technical documents, demo scripts, and sanitized evidence artifacts. GPT-5.6 is the bounded runtime component that produces a structured narrative candidate from selected character views, participant intents, and a creator-owned style profile. A second-model soft review is deferred from this MVP.

No other generative asset tool is part of the project. Open-source packages and public-domain source references are dependencies, not Codex-created assets, and must be credited normally.

## GPT-5.6 implementation

The live generation path will use the Responses API and Structured Outputs. The request model defaults to `gpt-5.6`; official documentation currently states that this alias routes to `gpt-5.6-sol`. `medium` reasoning effort is the first baseline, not a permanent quality claim.

The output schema requires:

- narrative
- selected style-profile ID and applied stable style-constraint IDs
- registered entity IDs mentioned in the draft
- utterances/actions with speaker or actor, one authorizing intent ID, optional contributing intent IDs, asserted claim IDs, and certainty
- used claim IDs and their evidence IDs
- character actions and knowledge IDs
- proposed claim or rule patches
- unknowns
- isolated expansion candidates

Application-side Zod parsing and deterministic validation still run after schema-constrained generation. Schema adherence is not equivalent to world consistency or literary quality. Live model wording is nondeterministic; deterministic claims apply to retrieval, validation, graph derivation, selected action transitions, hashes, and fixture replay.

Official sources:

- [Using GPT-5.6](https://developers.openai.com/api/docs/guides/latest-model)
- [GPT-5.6 prompt guidance](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Function Calling strict mode](https://developers.openai.com/api/docs/guides/function-calling#strict-mode)

## Why no model tool calling

The model receives one bounded evidence bundle and returns one bounded draft. It does not need to choose or sequence tools. Direct Structured Outputs keeps the model boundary smaller and the validator easier to audit.

## Why a style harness

The project does not rely on Codex or GPT-5.6 having the right default prose voice. An original `StyleProfile` makes viewpoint, tense, dialogue mode, prose goals, avoidances, prohibited phrases, and output bounds explicit and reusable. Deterministic code checks only objective constraints; the creator owns subjective voice and cadence judgments. A same-model unbounded/profiled comparison may be used as an ablation, but the project makes no Fable, Opus, or other model-writing superiority claim.

## Evidence boundary

Fixture mode is for deterministic development and the public judge-facing replay. Live mode is the only acceptable evidence for “GPT-5.6 integrated,” but it is disabled on the unauthenticated public deployment. Sanitized public logs under `artifacts/evidence/` may record requested model, actual model, status, token counts, validator result, content hashes, and a hashed response ID. They must not record API keys, raw response IDs, raw private prompts, personal paths, or private world content. Raw live records remain under ignored `artifacts/live/`.

## Codex evidence

The core vertical slice will be implemented in a clean Codex task containing only public-safe repository context. The task must record changed files and verification, then invoke `/feedback` after the core functionality is complete. The session ID stays out of the public repository and is entered only in a gitignored private submission record and the Devpost form.
