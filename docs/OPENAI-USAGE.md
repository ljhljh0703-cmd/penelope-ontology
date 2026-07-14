# OpenAI and Codex usage plan

## Role split

The user owns product direction, original style constraints, scope acceptance, canon decisions, subjective prose judgment, and final submission. Codex served as the engineering partner that converted those tacit standards into contracts, deterministic code, UI, tests, technical documents, demo scripts, and sanitized evidence artifacts. The implemented GPT-5.6 adapter is the bounded runtime boundary for requesting a structured narrative candidate from selected character views, participant intents, and a creator-owned style profile. No real GPT-5.6 response has been captured yet. A second-model soft review is deferred from this MVP.

No other generative asset tool is part of the project. Open-source packages and public-domain source references are dependencies, not Codex-created assets, and must be credited normally.

## GPT-5.6 implementation

The implemented live adapter uses the Responses API and Structured Outputs. The requested model is restricted to the GPT-5.6 family and defaults to `gpt-5.6`; official documentation currently states that this alias routes to `gpt-5.6-sol`. `medium` reasoning effort, a 4,096-token shared reasoning/output ceiling, a 90-second timeout, and zero automatic SDK retries form the first evidence baseline, not a permanent quality claim. Adapter and error-path tests are complete, while the real-call evidence gate remains open.

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

## Why a writing harness, not a better-writer claim

The project treats the familiar “Codex is a weaker writer than Fable or Opus” comparison as an engineering constraint, not a benchmark result to argue away. Default model prose can be fluent while flattening a creator's voice or quietly stepping outside the world. Codex therefore does not own the final writing judgment. It helps convert the creator's tacit standards into an original `StyleProfile` with explicit viewpoint, tense, dialogue mode, cadence, prose goals, avoidances, prohibited phrases, and output bounds. World truth and character knowledge remain separate typed layers, and creator approval remains separate from generation.

Deterministic code checks only objective constraints; the creator scores subjective voice and cadence through a condition-masked rubric. The preregistered comparison fixes the GPT-5.6 model, brief, evidence, schema, and reasoning setting in AB/BA order; only the creator style bundle changes between `default_instruction_control` and `profiled`. If the live capture and ratings satisfy the preregistered gates, the result can support only a narrow controllability claim on that probe. It cannot establish that Codex, GPT-5.6, Fable, Opus, or another system is the better writer.

## Evidence boundary

Fixture mode is for deterministic development and the public judge-facing replay. The public run route rejects live requests before orchestration; a real call is available only through the explicitly invoked local evidence command. Live evidence is the only acceptable basis for “GPT-5.6 integrated,” and none exists yet. Sanitized public logs under `artifacts/evidence/` may record requested model, actual model, status, token counts, validator result, content hashes, and a hashed response ID. They must not record API keys, raw response IDs, raw private prompts, personal paths, or private world content. Raw live records remain under ignored `artifacts/live/`.

## Codex evidence

The core vertical slice was implemented in a clean Codex task containing only public-safe repository context. The repository records changed files and verification. `/feedback` remains an external submission step: its session ID must stay out of the public repository and be entered only in a gitignored private submission record and the Devpost form.
