# OpenAI and Codex usage plan

## Role split

The user owns product direction, original style constraints, scope acceptance, canon decisions, subjective prose judgment, and final submission. Codex served as the engineering partner that converted those tacit standards into contracts, deterministic code, UI, tests, technical documents, demo scripts, and sanitized evidence artifacts. The implemented Responses adapter is the bounded API boundary for requesting a structured narrative candidate from selected character views, participant intents, and a creator-owned style profile; no Responses API call has been captured. Separately, the user-authorized Story Workbench lane completed one two-turn story run through the ChatGPT-authenticated Codex CLI while requesting `gpt-5.6-terra`. A later Book 19 World Workbench proof completed four accepted narration turns across two causal branches through the same requested-model transport. Neither run independently reported the serving model or response identity, and automated harness acceptance is not presented as the creator's literary verdict.

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

## Story Workbench Codex CLI generation

The story-first lane uses one command for a complete bounded branch:

```bash
npm run story:demo -- --transport codex_cli --branch quiet
```

Scene 1 is registered. The CLI generates Scenes 2 and 3 consecutively from the active story spine, selected choice, creator-owned style profile, scoped knowledge, character drives, and provisional causal ledger. Each turn must pass strict output parsing, exact next-choice bounds, actor ownership, safe-input knowledge scope, bounded semantic guards for every registered Red-Sail reserved action, causal echo, and final closure before the session commits. The machine-validated review candidate output hashes are `d35bbe89f261af97f508986cfec90b3a27588a0438a075ffa3d154e52800f727` and `a2f72d35f28bbfeae7e95856a1060b8021ac81b189156da785e4a5b22ff9cca8`.

This proves a completed **Codex CLI story-generation transport** requesting `gpt-5.6-terra`. It does not prove that `gpt-5.6-terra` was the actual serving model: `actualModel` and `responseId` remain `null`. The generated scenes were not manually edited, but machine acceptance is not a literary verdict; creator review remains pending in the private Terra review packet.

## World Workbench Codex CLI generation

The product-hero lane was also exercised through the local browser with the Codex CLI transport enabled. From the same Book 19 opening checkpoint, it completed both world lines:

```text
C: dismiss Melantho → order the washing → Plan Compromised
opening checkpoint → order the washing → observe → Canon Contained
```

The final four narration candidates were accepted without manual rewriting. Before that successful run, the harness rejected an ambiguous pronoun and a sentence that made the hearth an acting subject. Both failures stopped before approval and left the authoritative world unchanged. The accepted branch endpoints bind different state and receipt hashes, and Fork Compare exposes their different NPC movement, identity-exposure pressure, and ending.

This supports the narrow claims that the World Workbench exercised its live Codex CLI narration path, requested `gpt-5.6-terra`, failed closed on weak wording, and preserved deterministic state authority across both branches. The CLI still leaves `actualModel` and `responseId` unknown. The English review was delegated to Codex because the creator requested language assistance; it is not a human creator literary acceptance or a comparative writing-quality result.

Official sources:

- [Using GPT-5.6](https://developers.openai.com/api/docs/guides/latest-model)
- [GPT-5.6 prompt guidance](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Function Calling strict mode](https://developers.openai.com/api/docs/guides/function-calling#strict-mode)

## Why no model tool calling

The model receives one bounded evidence bundle and returns one bounded draft. It does not need to choose or sequence tools. Direct Structured Outputs keeps the model boundary smaller and the validator easier to audit.

## Why a writing harness, not a better-writer claim

The project treats the familiar “Codex prose can feel generic” criticism as an engineering constraint, not a benchmark result to argue away. Default model prose can be fluent while flattening a creator's voice or quietly stepping outside the world. Codex therefore does not own the final writing judgment. It helps convert the creator's tacit standards into an original `StyleProfile` with explicit viewpoint, tense, dialogue mode, cadence, prose goals, avoidances, prohibited phrases, and output bounds. World truth and character knowledge remain separate typed layers, and creator approval remains separate from generation.

Deterministic code checks only objective constraints; the creator scores subjective voice and cadence through a condition-masked rubric. The preregistered comparison fixes the GPT-5.6 model, brief, evidence, schema, and reasoning setting in AB/BA order; only the creator style bundle changes between `default_instruction_control` and `profiled`. If the live capture and ratings satisfy the preregistered gates, the result can support only a narrow controllability claim on that probe. It cannot establish universal writing superiority.

## Evidence boundary

Fixture mode is for deterministic development and the public judge-facing replay. The public Table route rejects live requests before orchestration; the Story and World workbenches permit HTTP Codex CLI generation only behind an explicit server flag, a bounded private token, and a loopback host. The completed product runs are Codex CLI generation evidence, not accepted results from the legacy approval-bound evidence lane and not Responses API traces. They support the narrow claim “Codex CLI narration requesting `gpt-5.6-terra`,” not an independently verified serving-model identity claim. Sanitized public logs under `artifacts/evidence/` may record requested model, actual model, status, token counts, validator result, content hashes, and a hashed response ID. They must not record API keys, local authorization tokens, raw response IDs, raw private prompts, personal paths, or private world content. Raw legacy live records remain under ignored `artifacts/live/`; the Book 19 creator-review record is likewise gitignored and contains no credentials or Codex conversation transcript.

## Codex evidence

The core vertical slice and world-first extension were implemented in Codex tasks containing only public-safe repository context. Codex converted the creator's causal and prose expectations into typed story contracts, a prepared-route rehearsal, a creator-direction interview with hash-confirmed execution, local-only CLI transport, causal world receipts, fork comparison, browser checks, and a private review record. The repository records changed files and verification. The required `/feedback` session ID was submitted through the external form and remains only in the gitignored private submission record; it must never enter the public repository.
