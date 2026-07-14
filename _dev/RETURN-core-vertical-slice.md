# Core vertical slice RETURN

Status: `CORE_FIXTURE_COMPLETE_RELEASE_VERIFIED_EXTERNAL_GATES_PENDING`

Date: 2026-07-15 KST

Branch: `codex/core-vertical-slice`

Starting commit: `0b24c866276cfe446fa313bda5ced3eaff052977`

Verified implementation commit: `a23faceec08da24bb12d4cd51b219772699affe1`

## What changed

- Implemented the facilitator-facing Table: two local participant intents, an original creator-owned style profile, evidence and conflict controls, a derived canon/knowledge graph, accept/edit/reject, same-turn rebase, two deterministic transitions, and frozen replay.
- Added strict participant, style, world, proposal, decision, graph, replay, and simulation contracts plus character-scoped retrieval and named hard validators.
- Hardened the public creator gate. The server replays fixture authority, accepts only registered overlay v0 / snapshot S0, rejects fabricated proposals and self-hashed injected canon, and preserves unresolved sibling proposals.
- Added a gated GPT-5.6 Responses adapter restricted to the GPT-5.6 family with Structured Outputs, a 4,096-token ceiling, 90-second timeout, zero SDK retries, typed failures, and fixture/live identity separation.
- Added a preregistered same-GPT-5.6 AB/BA style probe. Plan, exact request schema, capture, public receipt, blind packet, ratings, and report are hash-bound; failed slots cannot be replaced and public outputs contain no prose or response IDs.
- Bound future sanitized live evidence to the current World Pack hash, overlay, snapshot, style, and exact request. The live capture reserves a write-once lock before spending a call.
- Added release evidence, privacy scanning, error-recovery coverage, source verification, and factual Build Week/Devpost documents. No root README or portfolio case study was generated because candidate-mode approval remains explicit.

## Writing-harness claim boundary

The project takes the familiar comparison “Codex is a weaker writer than Fable or Opus” as a design constraint, not a result to deny. Codex served as the engineering partner that translated tacit narrative standards into explicit style, world, evidence, approval, and replay layers. The creator still owns voice, taste, canon, and final judgment. Until live capture and masked ratings exist, this proves an inspectable mechanism and evaluation path—not improved prose, productivity, or model superiority.

## Verification

- Local `npm run verify:release`: PASS — evidence generation/manifest verification, ESLint, TypeScript, 24 Vitest files / 123 tests, privacy scan over 142 public candidates, Next production build, and 8 Playwright checks across desktop Chromium and iPhone/WebKit.
- Fresh-copy rehearsal: PASS — `npm ci` installed 395 packages with 0 reported vulnerabilities, followed by the same 123 tests, privacy scan, production build, and 8 browser checks.
- Focused style-integrity suite: 5 files / 32 tests PASS.
- Adversarial decision check: a self-hashed overlay containing unapproved `rule.creator.injected` returns `409 creator_decision_authority_invalid`.
- Public evidence: seven sanitized JSON artifacts plus `manifest.json`; manifest SHA-256 `a234acb269df54123261bce7cc103a041cd1e1b30118ae4843921b54cf983431`.
- Source locators: four Perseus references resolved with HTTP 200; original summaries remain `reference_only` as recorded in `docs/SOURCE-VERIFICATION.md`.
- `git diff --check`: PASS before the implementation commit. No raw live prose, API key, personal path, private session ID, or Vault content entered the repository.

## Gates and remaining risks

1. **Real GPT-5.6 evidence:** no local API key was available, so neither the sanitized live run nor four-call style capture exists. Fixture/protocol evidence must not be relabeled as a live result.
2. **README and portfolio copy:** `package-project-evidence` audit is certified; write and derive are `SERVING_CANDIDATE`. The skill requires explicit user approval and a rerun with `--allow-candidate`. `juhyeong-voice` remains prohibited.
3. **External release:** final product name, GitHub remote, public CI, hosted fixture demo, narrated video, private `/feedback` field, and Devpost submission remain undone.
4. **Evidence limits:** there is no remote multiplayer room, graph database, embeddings, long-horizon agent simulation, quest automation, practitioner result, or measured productivity improvement.

## Loop report

No trapped loop occurred. Failures were addressed with new falsifiable hypotheses: schema/authority drift, a self-hashed injected base, a hidden-claim graph axis, stale recovery state, and a browser assertion that conflated approved base rules with the proposal rule. No identical failure was retried three times without a new hypothesis.

## Gate result

`PARTIAL`: the bounded fixture product is implemented, adversarially audited, committed locally, and reproducible from a clean copy. Live-model, candidate-copy approval, and external submission gates remain outside this commit. No push, deployment, `/feedback`, or Devpost submission was performed.

## Sub-brain status

Read-only. No Vault wiki, authority document, Progress, Memory, or skill was modified. No new skill candidate was needed; the existing project-evidence workflow covers public packaging.

## Next user action

Configure `OPENAI_API_KEY` locally without pasting it into chat, then report only `키 설정 완료`; the next run will capture and verify the single live GPT-5.6 evidence path before any public claim changes.
