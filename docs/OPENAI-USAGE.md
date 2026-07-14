# OpenAI and Codex usage plan

## Role split

The user owns product direction, scope acceptance, canon decisions, and final submission. Codex creates the code, UI, tests, technical documents, demo scripts, and sanitized evidence artifacts. GPT-5.6 is a runtime component that drafts narrative and later performs a non-authoritative soft review.

No other generative asset tool is part of the project. Open-source packages and public-domain source references are dependencies, not Codex-created assets, and must be credited normally.

## GPT-5.6 implementation

The live generation path will use the Responses API and Structured Outputs. The request model defaults to `gpt-5.6`; official documentation currently states that this alias routes to `gpt-5.6-sol`. `medium` reasoning effort is the first baseline, not a permanent quality claim.

The output schema requires:

- narrative
- used claim IDs
- asserted claims and their evidence IDs
- character actions and knowledge IDs
- proposed state changes
- unknowns
- isolated expansion candidates

Application-side Zod parsing and deterministic validation still run after schema-constrained generation. Schema adherence is not equivalent to world consistency.

Official sources:

- [Using GPT-5.6](https://developers.openai.com/api/docs/guides/latest-model)
- [GPT-5.6 prompt guidance](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Function Calling strict mode](https://developers.openai.com/api/docs/guides/function-calling#strict-mode)

## Why no model tool calling

The model receives one bounded evidence bundle and returns one bounded draft. It does not need to choose or sequence tools. Direct Structured Outputs keeps the model boundary smaller and the validator easier to audit.

## Evidence boundary

Fixture mode is for deterministic development and judge-friendly replay. Live mode is the only acceptable evidence for “GPT-5.6 integrated.” Sanitized live logs may record requested model, actual model, response ID, status, token counts, validator result, and content hashes. They must not record API keys, raw private prompts, personal paths, or private world content.

## Codex evidence

The core vertical slice will be implemented in a clean Codex task containing only public-safe repository context. The task must record changed files and verification, then invoke `/feedback` after the core functionality is complete. The session ID stays out of the public repository and is entered only in a gitignored private submission record and the Devpost form.
