# Start here

This repository contains the implemented core vertical slice for **Penelope Ontology**, a Build Week Work & Productivity project.

For the current status, deadline plan, Go/No-Go gates, and next Codex task boundary, read [`BUILD-WEEK-COMMAND-CENTER.md`](./BUILD-WEEK-COMMAND-CENTER.md).

## Product in one sentence

**Penelope Ontology carries a creator's choice through character, world, and prose until the story pays it off.**

The primary users are professional GMs, narrative production teams, and game scene or quest designers who need a story to keep moving without losing character knowledge, world facts, creator-owned style, or responsibility for an earlier choice. Writers working inside a bounded canon are an adjacent audience, not a separately validated user segment. The product does not claim that a language model “remembers the world” or naturally owns the creator's voice. Its story-first path is:

```text
bounded choice or direct action
→ causal resolution
→ scoped character/world knowledge + creator style
→ next-scene prose
→ consequence echo
→ three-scene small-arc payoff
```

The product opens on the Story Workbench at `/` (`/story` remains a direct alias). The original Table rehearsal remains a second, more forensic control surface at `/table`:

```text
registered fixture ParticipantIntent[2] / gated live ParticipantIntent[]
+ StyleProfile + World Pack / SimulationSnapshot
→ deterministic retrieval
→ fixture structured draft / gated GPT-5.6 structured draft
→ hard validation
→ creator decision
→ derived canon/knowledge graph
→ versioned canon overlay + deterministic transition
→ second snapshot + frozen replay
```

## Why Penelope Ontology

Penelope refuses to mistake a signal for proof. **Penelope Ontology refuses to mistake a generated draft for canon.** The name turns the Red-Sail scene's central judgment into the product's operating rule: model output may propose what could happen, but only traceable evidence and creator approval may change what is true.

“Ontology” refers here to the explicit structure connecting characters, claims, source traditions, knowledge boundaries, creator rules, and world states. It does not claim a graph database, RDF/OWL implementation, or formal Semantic Web compliance; the current visual surface is a derived canon/knowledge graph.

## Why the Red-Sail test matters

The red sail is not important because it is a spectacular piece of lore. It is important because the rule does **not** exist in the source canon, yet it would have a real consequence if adopted. That makes one small scene test the product's entire promise.

Penelope's participant wants the household to distinguish a signal from proof. Telemachus's participant wants a useful response without claiming that Odysseus has returned. A fluent model can easily collapse both intents into a dramatic but false conclusion. This harness must instead preserve the uncertainty, attribute both contributions, and mark the proposed red-sail convention as a creator-owned expansion rather than a retrieved fact.

The proposal still cannot change the world. Before approval, the harbor remains `idle`; rejection leaves canon and state untouched. Only creator approval can add the rule, after which deterministic validation and replay allow the world to move from `idle` to `watching` to `signal_seen`.

In other words, this is not a demo of an AI inventing a sentence. It is a compact proof that multiple human intentions can become a traceable story possibility without quietly becoming world truth—and that an approved story rule can then drive an inspectable simulation.

## Current truth

Implemented and fixture-verified:

- a story-first `/story` workbench that opens under pressure, accepts a real branch or direct action, shows causal changes, and carries the selected consequence through a bounded three-scene arc
- a typed story spine, character drives, creator-owned prose profile, scene contracts, resolution envelopes, scoped knowledge, causal ledger, fail-forward path, and commit-after-validation runtime
- a one-command fixture or ChatGPT-authenticated Codex CLI story demo: `npm run story:demo -- --transport <fixture|codex_cli> --branch <quiet|bell>`
- a Next.js Table workbench that replays one registered, frozen two-intent fixture with one original creator-owned style profile
- strict World Pack, model draft, overlay, decision, graph, simulation, and replay contracts
- deterministic character-scoped retrieval, hard validation, provenance graph, creator decision, hashing, and two-step transition
- a small public-safe Greek mythology fixture with five frozen cases and an eight-stage replay
- a live GPT-5.6 Responses adapter with strict Structured Outputs and typed failure paths
- a separate ChatGPT-authenticated Codex CLI capture path that requests `gpt-5.6-sol`, binds the exact model input, prompt, output schema, execution contract, World Pack, and request to one creator-approved authority hash, and runs without tools in an ephemeral read-only workspace
- a request-hash-bound primary approval, no-cost preflight, and one explicit `retry-1` path that opens only after a retryable typed failure and a separate approval
- a private creator review that exposes generated prose locally, accepts only `accept` / display-only `edit` / `reject`, and publishes only prose-free harness evidence
- fixture/live evidence separation, privacy scanning, browser tests, and generated public evidence artifacts
- actual-route Story Workbench browser coverage on desktop and mobile: 2/2 checks passed without mocking the story API
- a fail-closed Myth Atlas intake that accepted packaging revision `v1.0.1` with manifest `schemaVersion: "1.0.0"` only as `quarantined_private_reference` after schema, regular-file, byte, and SHA-256 checks across 16 external assets totaling 2,489,820 bytes
- a deterministic, path-free Myth Atlas compatibility report that binds that private intake receipt to the registered demo World Pack while keeping runtime, model-input, canon, and public eligibility at `false` / zero until explicit mappings and review gates exist
- a preregistered same-GPT-5.6 style-control AB/BA protocol with no automatic retries, condition-masked creator ratings, and a write-once public report
- a post-commit exact-SHA release rehearsal and deployment smoke whose per-commit result is stored only in ignored `private-submission/release-record.json`; any tracked change invalidates that record until the new HEAD is recertified

The public reviewer surfaces default to fixtures. The Story Workbench live selector requires the explicit server flag, a 32-byte-or-longer private token, and a loopback host; the token stays in tab memory and is sent only as a request header. Fixture output is never presented as a live model response.

Separately from the historical approval-bound evidence attempts below, one user-authorized Story Workbench run used the ChatGPT-authenticated bundled Codex CLI and requested `gpt-5.6-sol`. It generated Scene 2 and Scene 3 consecutively, passed the story schema, safe-input scope, typed and bounded semantic action guards, causal-echo, and closure gates, and completed the session. The final candidate output hashes are `e00dec6e24c3b13f241f3b763f88816eb09ed814569fbacaa73b63aa487eefbf` and `4f2ad711ab0199a425efd17e12bba7bee856aa0b2d4f3f62cf617b04966ebf1f`. This transport does not independently report the serving model or Responses API identity, so `actualModel` and `responseId` remain `null`. The creator's prose verdict is still pending.

Not verified or released yet:

- actual GPT-5.6 serving-model identity or a Responses API call: the Story Workbench proves a completed Codex CLI generation requesting `gpt-5.6-sol`, not the underlying model identity, a Responses API response, or a submission-ready sanitized live-evidence bundle
- creator acceptance of the final live story candidate; automated story gates passed, but literary quality remains a human decision
- the four-call style capture and creator ratings; the public readiness artifact currently says `not_executed`
- Myth Atlas public/canon acceptance: the private intake carries producer-reported counts of ten exact-passage candidates, five `video_reported` items, and six pending items, with creator-review, rights, culture, provenance, video, and pending-item warnings still open
- a public hosted deployment
- the final README, whose approved writing pipeline currently reports `SERVING_STALE` and must be refreshed before use
- a narrated public demo video, `/feedback` submission field, and final Devpost submission
- practitioner testing or evidence of productivity improvement

## Local setup

Requirements: Node.js 22.x and npm. Use the lockfile-backed install so the tested dependency graph is reproduced.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Fixture mode is the default and does not require an API key. The public route rejects live requests, and the public fixture is not an arbitrary participant-intent composer. Arbitrary facilitator-collected intents exist only at the gated live-adapter boundary.

ChatGPT login for Codex CLI does not provide a general OpenAI API credential. This repository therefore keeps two independent live-evidence transports: the Responses API path still requires authorized API access, while the Codex CLI path uses the local ChatGPT-authenticated Codex allowance and requests `gpt-5.6-sol`. A CLI capture is CLI evidence only; it must never be relabeled as a Responses API response. Do not copy `~/.codex/auth.json` or treat it as an API key.

### Story Workbench Codex CLI demo

The user-authorized product lane can run the complete quiet branch with one command:

```bash
npm run story:demo -- --transport codex_cli --branch quiet
```

It uses the ChatGPT-authenticated bundled Codex CLI, strict structured output, an ephemeral read-only execution, and no tools. Scene 1 is the registered opening; Scenes 2 and 3 are generated in sequence and committed only after the runtime validates scope, actor ownership, reserved-next-action boundaries, causal echo, and small-arc closure. The final unedited candidate and exact hashes are recorded in [`STORY-LIVE-CREATOR-REVIEW.md`](./STORY-LIVE-CREATOR-REVIEW.md). Label this evidence as **Codex CLI story generation requesting `gpt-5.6-sol`**. Do not shorten that to “GPT-5.6 generated” while `actualModel` remains unreported, and do not treat automated acceptance as the creator's prose verdict.

The one-command demo invokes the CLI directly and needs no HTTP token. To use the **Live Codex** selector in the local browser, generate a private token, place the flag and token in `.env.local`, restart the development server, and enter the same token into the page's password field:

```bash
openssl rand -hex 32
# .env.local — never commit this file
PENELOPE_STORY_CODEX_CLI_ENABLED=1
PENELOPE_STORY_CODEX_CLI_TOKEN=<generated-token>
npm run dev
```

The server requires the flag, the bounded token, and a loopback host. The page keeps the presented token only in tab memory, sends it in `x-penelope-story-token`, and excludes it from story JSON and receipts.

### Legacy approval-bound Codex CLI evidence lane

Before the Story Workbench existed, the submission evidence lane used a private, gitignored review packet containing the exact registered model input, prompt, strict output schema, reviewed command identity, and execution contract. The packet also records SHA-256 bindings for those objects, the registered request, the World Pack, and the exact predecessor receipt for retry. The sequence below documents the consumed workflow; both registered CLI attempts are terminal, so do not execute it again:

```bash
npm run evidence:codex-cli:review
npm run evidence:codex-cli:approve -- --authority-sha <sha>
npm run evidence:codex-cli:preflight
npm run evidence:codex-cli:capture
```

Review, approval, preflight, and capture are separate operations. Approval is private, write-once, and valid only for the exact combined authority hash. Capture reruns preflight, creates an exclusive reservation, and permits one dispatch. The process uses `codex exec` with prompt input on stdin, `--ephemeral`, ignored user config and repository rules, an empty working directory, `read-only` sandboxing, a strict output schema, and an environment allowlist. Any command, file, MCP, web, or other tool event fails the capture.

Raw JSONL, the final generated message, thread identity, review packet, approval, and terminal attempt receipt stay under ignored private paths. The optional public manifest group contains a bounded sanitized result plus a derived prose-free public receipt with hashes and usage counts. Because the CLI event stream does not independently establish the underlying response model or API response identity, CLI evidence intentionally records `requestedModel: "gpt-5.6-sol"` while `actualModel` and `responseId` remain `null`. A terminal success or failure receipt consumes the approval; semantic or sanitization failure cannot silently reopen the same dispatch. If terminal-receipt persistence fails, the reservation remains for manual recovery.

The primary review and write-once approval were consumed by one explicitly authorized CLI attempt whose child exited nonzero. Separately approved `retry-1` used the OpenAI SDK's normalized strict schema, passed preflight, and dispatched once. Its child exited zero after five parseable JSONL envelopes, but the adapter terminally rejected an unrecognized event or item type. The immutable pre-patch receipt did not retain the exact type and contains no accepted usage, raw capture, sanitized result, actual model, or response ID. Both commands are closed, no `retry-2` exists, and the later bounded event-type observations apply only to future failures. Review, approval, preflight, dispatch, failed-attempt receipts, and adapter recertification do not count as live model evidence; a committed exact-SHA release proof also remains separate.

### Responses API capture

For a deliberate local live capture, edit the ignored `.env.local` created above:

```dotenv
ENABLE_OPENAI_LIVE=true
OPENAI_API_KEY=<your-key>
OPENAI_MODEL=gpt-5.6
OPENAI_REASONING_EFFORT=medium
```

The paid path is deliberately split from creative approval. First review the registered Red-Sail contract: Penelope treats the sail as a signal rather than proof, Telemachus proposes a cautious harbor watch, and the model may return exactly one fixed `add_rule` proposal with no state action. The current request accepts only `outputLocale: "en"`; that locale is part of the approval hash. A narrow script-family gate rejects generated fields containing non-Latin letters, but it is not semantic English detection—the creator still owns the final language and prose judgment. Only after the creator approves that contract, run:

```bash
npm run evidence:live:approve
npm run evidence:live:preflight
npm run evidence:live
```

The approval is write-once and bound to the registered request hash. Capture reruns preflight immediately before constructing the model client, so the standalone preflight cannot be reused as stale permission. There is no automatic retry. Only a primary typed-failure receipt with `retryable: true`, no canonical output, and no unresolved lock or recovery sentinel can open the fixed `retry-1` path; that path also requires a separate creator approval:

```bash
npm run evidence:live:retry:approve
npm run evidence:live:retry:preflight
npm run evidence:live:retry
```

After a successful capture, generate and verify the public-safe receipt, then prepare the ignored local creative review:

```bash
npm run evidence
npm run evidence:verify
npm run evidence:live:review
```

Read `artifacts/live/creator-review.md` and replace the pending value in `artifacts/live/creator-decision.json` with exactly one of `{"action":"accept"}`, `{"action":"reject"}`, or `{"action":"edit","displayDescription":"..."}`. Editing can change presentation wording only; the proposal's canonical meaning remains locked. Finalize and regenerate the manifest with:

```bash
npm run evidence:live:finalize
npm run evidence
npm run evidence:verify
```

These commands and `npm run eval:style:capture` load `.env.local` explicitly on Node 22; they do not require exporting the key into the parent shell. Never commit `.env.local`. Before dispatch, capture writes a prose-free recovery sentinel. Every normal success or failure replaces that sentinel with an append-only ignored receipt under `artifacts/live/live-capture-attempts/`; if receipt persistence itself fails, the sentinel and exclusive lock remain for manual recovery instead of letting the call disappear. A completed raw-and-sanitized pair and both creator-decision outputs are write-once. Generated prose, response identity, and the local decision record remain ignored; public evidence contains only bounded status, hashes, IDs, counts, and transition receipts. Until a Responses API call is captured, fixture output and Codex CLI output must not be described as a Responses API or independently verified GPT-5.6 response.

Localization is a post-submission sequence, not a current capability claim: Korean first, then Japanese, then Chinese. Each locale must receive a new request hash, locale-specific style fixtures and script checks, and human review evidence. Machine IDs and canonical rule meaning remain language-neutral; localized presentation belongs in non-authoritative display text.

Run the local gate with:

```bash
npm run verify
```

After the local candidate is committed and recertified, copy `docs/submission/SUBMISSION-RECORD.example.json` to the gitignored `private-submission/submission-record.json` and fill only fields that have actually been verified. Then run:

```bash
npm run submission:check
npm run submission:check:post
```

The first command requires the final name and description, a manifest-bound GPT-5.6 sanitized result plus completed capture receipt tied to the current World Pack/request, the matching ignored raw local proof, README, public GitHub HEAD and the exact `ci.yml` push run, allowlisted public-host exact-SHA smoke, a public narrated YouTube video under three minutes, a UUID-shaped private `/feedback` value, and the confirmed Devpost track. The private video receipt must also confirm that the recording demonstrates the product and explains both Codex and GPT-5.6 use. The second command additionally requires human-attested fields copied after an authenticated owner view or plugin-assisted check; its name, track, description SHA-256, repository, demo, and video must match the final local packet. It is not an inference from a public URL. Both commands print stable PASS/FAIL identifiers only; they do not echo private IDs or external URLs. The tracked `docs/submission/CLAIM-CONTRACT.json`, not an editable private boolean alone, activates the separate AB/BA evidence gate for a measured style-control claim.

Hosted smoke is intentionally restricted to public deployment origins on the supported provider suffix list in `src/submission/readiness.ts`; arbitrary HTTPS or internal-service targets are rejected before any request is made.

The style evaluation is documented in [`STYLE-ABLATION-PROTOCOL.md`](./STYLE-ABLATION-PROTOCOL.md). Its live commands are `npm run eval:style:capture` and `npm run eval:style:report -- --ratings <ratings.json>`; do not run them without reading the write-once and no-replacement rules first. The public evidence allowlist accepts the style receipt and report only as a complete pair, so `npm run evidence:verify` intentionally remains blocked after capture until the masked creator ratings are finalized into the report.

## Repository map

- `app/`: Story and Table workbenches plus stateless HTTP endpoints
- `components/story/`: story-first prose, choice, consequence, and provenance surface
- `components/table/`: workbench state machine and accessible graph view
- `src/application/`: story-turn orchestration, run orchestration, and frozen replay
- `src/domain/`: story scope/resolution plus deterministic retrieval, validation, graph, overlay, and simulation core
- `src/contracts/`: structured model and HTTP contracts
- `src/ports/`: model boundary
- `src/adapters/`: filesystem, fixture, and gated GPT-5.6 adapters
- `src/evaluation/`: preregistered style-control contracts, schedule, masked packet, and fail-closed evaluator
- `src/submission/`: strict private-record contract and fail-closed final-readiness evaluation
- `data/world-packs/`: public-safe demo data
- `tests/`: contract, unit, API integration, replay, privacy, and browser checks
- `artifacts/evidence/`: sanitized generated fixture evidence and SHA-256 manifest
- `docs/`: PRD, architecture, evidence, and submission preparation
- `_dev/CORE-BUILD-DISPATCH.md`: clean Codex-session contract for core implementation

## Why this is not README.md yet

This file remains the technical entry point because the `package-project-evidence` write preflight currently reports `SERVING_STALE` after detecting changed README-authority hashes. The executable Evidence Packet exists, but the README pipeline must be refreshed before generation. The user's prohibition on `juhyeong-voice` also remains binding. Actual serving-model proof, creator prose acceptance, and submission-ready live evidence remain separate pending gates.

## Official OpenAI implementation sources

- [Using GPT-5.6](https://developers.openai.com/api/docs/guides/latest-model)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-5.6 prompt guidance](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6)
