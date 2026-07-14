# Core vertical slice RETURN

Status: `CORE_FIXTURE_COMPLETE_EXTERNAL_GATES_PENDING`

Date: 2026-07-15 KST
Branch: `codex/core-vertical-slice`
Starting commit: `0b24c866276cfe446fa313bda5ced3eaff052977`
Verified core commit: `a736390f16f2de62ede91b1cada4af7b661d8915`

## What changed

- Implemented typed participant-intent, style, world, proposal, decision, graph, replay, and simulation contracts.
- Implemented character-scoped retrieval, deterministic hard validation, creator-controlled canon overlay, canonical hashing, graph projection, and the bounded `idle → watching → signal_seen` simulation.
- Added fixture and explicitly gated GPT-5.6 Responses adapters. Fixture and live evidence identities cannot cross.
- Replaced the Day-0 shell with the facilitator-facing Table UI: two local participant intents, style selection, evidence and violation review, accept/edit/reject, rebase, two transitions, graph view, and frozen replay.
- Added stateless demo/run/decision/transition APIs, executable fixtures, browser tests, privacy scanning, evidence generation, evidence-manifest verification, and a fail-closed sanitized live-capture command.
- Added source verification and factual submission/evidence documents. No public README or portfolio case-study copy was generated because the approved writing pipeline is stale.

## Writing-harness claim boundary

The defensible claim is not that Codex or GPT-5.6 writes better prose than Fable, Opus, or another model. The implemented contribution is to turn default-writing weakness into an explicit production surface: creator-owned style constraints, character-scoped knowledge, world-claim validation, creator approval, deterministic state changes, and frozen replay. Subjective taste remains with the creator; constraints and regressions become inspectable and testable.

## Verification

- Current repository release gate: PASS — evidence generation and manifest verification, lint, typecheck, 77 unit/API tests, privacy scan over 129 public candidates, production build, and 6 Playwright checks across desktop Chromium and iPhone/WebKit.
- Fresh-copy release rehearsal: PASS — `npm ci` installed 395 packages with 0 reported vulnerabilities, then the same 77 tests, privacy scan, production build, and 6 browser checks passed outside the working tree.
- Source locators: four Perseus references resolved with HTTP 200 and are recorded in `docs/SOURCE-VERIFICATION.md`.
- Public evidence: six sanitized JSON artifacts plus `artifacts/evidence/manifest.json`; raw live output remains ignored under `artifacts/live/`.
- Evidence manifest SHA-256: `a6c0769b676228fdcbec6320bd6fdf7de33dc2a86a0eea5521a8b8202b4d76dd`.
- Missing-environment live capture: fails closed with `configuration_error` and writes no public live artifact.
- Usage receipt: `_dev/usage-receipt.json`; external verification gate remains pending by contract.

## Gates and remaining risks

1. **Real GPT-5.6 evidence:** `OPENAI_API_KEY` is absent. The adapter is mock-tested, but no live-model claim is allowed until `ENABLE_OPENAI_LIVE=true npm run evidence:live` succeeds and the sanitized artifact is verified.
2. **README and portfolio prose:** `package-project-evidence` audit preflight passed, while write and derive preflights returned `SERVING_STALE`. Vault Claude must refresh the delegate manifest before either surface is generated.
3. **External release:** final product name, GitHub remote, public CI result, fixture deployment, narrated video, `/feedback` session field, and Devpost submission remain undone.
4. **Evidence limits:** no remote multiplayer, graph database, embeddings, long-horizon agent simulation, quest automation, users, or measured productivity result exists. Do not imply otherwise.

## Loop report

No trapped loop occurred. The alias validator false positive was fixed with a Unicode-aware token boundary. Earlier fresh-copy failures caused by generated build metadata were resolved with an explicit copy rule and regression test. The final copy's first browser launch was denied by the filesystem sandbox's localhost-binding policy; rerunning the unchanged candidate with the required permission passed. No failure was retried three times without a new hypothesis.

## Gate result

`PARTIAL`: the local fixture product is implemented, evidence-backed, and committed locally; live-model and approved public-writing gates remain external blockers. No push, deployment, `/feedback`, or Devpost submission was performed.

## Sub-brain status

Read-only. No Vault wiki, authority document, Progress, Memory, or skill was modified. No new skill candidate: the existing project-evidence workflow covers the reusable packaging task.

## Next user action

Ask Vault Claude to refresh the `package-project-evidence` write/derive source manifest, and configure a local `OPENAI_API_KEY` separately so the sanitized live-evidence gate can run.
