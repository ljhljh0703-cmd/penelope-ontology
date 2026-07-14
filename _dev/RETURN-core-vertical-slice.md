# Core vertical slice RETURN

Status: `CORE_FIXTURE_COMPLETE_EXTERNAL_GATES_PENDING`

Date: 2026-07-15 KST

Branch: `codex/core-vertical-slice`

Starting commit: `0b24c866276cfe446fa313bda5ced3eaff052977`

Local release candidate: exact-SHA release gate, clean-clone reproduction, and deployment smoke verified. The current post-commit identity is recorded in ignored `private-submission/release-record.json` to avoid self-referential tracked proof.

Public evidence manifest SHA-256: `5d1d725860a45967c83fc3d6b0b20f58f58b483397e76a821d95d8dbd92b5f18`

## What changed

- Implemented a facilitator-facing Table that honestly replays one registered, frozen two-intent scene rather than presenting a fixed fixture as arbitrary text composition. Penelope and Telemachus each authorize a playable line and retain reciprocal contributing-intent lineage.
- Added a visible responsibility contract, style receipt, and `Who can know this?` table. The UI machine-checks only the output bound, labels six voice constraints for creator review, and distinguishes narrator-visible, character-withheld, and character-uncertain knowledge.
- Moved the creator gate before the detailed graph, collapsed graph text by default, and added a production review packet for human handoff. The packet is explicitly fixture evidence, not practitioner or production-readiness evidence.
- Bound public run, decision, and transition routes to the exact registered replay request. Changed brief, intent, draft, style, task, overlay, or snapshot data cannot relabel or authorize the fixed fixture.
- Preserved creator authority: accept/edit/reject is server-replayed; display wording remains separate from locked semantics; accepted overlays rerun four controls before a two-step `idle → watching → signal_seen` state chain.
- Hardened the gated GPT-5.6 capture command with Node 22 `.env.local` loading, preflight checks, a pre-dispatch recovery sentinel, an exclusive lock, prose-free append-only receipts, atomic no-clobber publication, target-race preservation, partial-pair rollback, and explicit retry. Receipt-write failure retains the sentinel and lock instead of erasing the attempt.
- Made evidence generation and health readiness require the full generated evidence type, GPT-5.6 model family, authority hashes, completed capture-receipt binding, sanitized path, and public-privacy contract instead of a status string.
- Updated the judge guide, Devpost draft, 378-word narration, shot list, evidence ledger, and decision log to the same fixture/live/style claim boundary.

## Writing-harness claim boundary

The project treats familiar skepticism about generic default Codex prose as a design constraint, not a benchmark result. Codex served as the engineering partner that translated voice, canon, character knowledge, participant ownership, and world-state change into explicit style, world, evidence, approval, and replay layers. The creator still owns original style, taste, canon, scope, and final judgment. Current evidence proves the implemented mechanism, frozen lineage, deterministic checks, and regressions. It does not prove better prose, a measured style effect, arbitrary-intent generation, productivity gains, users, or model superiority over Fable, Opus, or another system.

## Verification

- Evidence generation and seven-file manifest verification: PASS.
- ESLint and TypeScript with incremental cache disabled: PASS.
- Vitest: 30 files / 156 tests PASS.
- Focused deployment-smoke request, public evidence, health, and live-capture suite: 4 files / 18 tests PASS.
- Privacy scan: 164 public candidates PASS.
- Next production build: PASS.
- Production browser: 10/10 PASS across desktop Chromium and mobile WebKit, including frozen inputs, reciprocal lineage, style receipt, knowledge boundary, creator decision, display/semantic separation, exact-overlay replay, failure recovery, and two transitions.
- Visual inspection: desktop candidate, mobile candidate, and completed desktop flow with the review packet open show no clipped controls, overlap, or fixture/live ambiguity. Five public-safe 1440×900 gallery captures were inspected and bound to `docs/assets/demo/manifest.json` by SHA-256.
- `git diff --check`: PASS. No raw live prose, API key, personal absolute path, private session ID, Vault content, or private story asset entered the repository.

The exact-SHA clean-copy and deployment-smoke authority is generated only after each tracked release-candidate commit. Its local record belongs in ignored `private-submission/release-record.json`, preventing a self-referential proof commit. Both the working repository and an independent clean clone passed the identified release gate and production smoke; hosted-origin and public-CI proof remain separate.

## Gates and remaining risks

1. **Real GPT-5.6 evidence:** `.env.local` is absent. Neither the sanitized integration trace nor the four-call style capture exists. The fixture and adapter/protocol tests must not be relabeled as a completed live result.
2. **Arbitrary participant intents:** the live contract accepts them, but the public fixture proves only its registered frozen pair. Reopen the public claim after sanitized live evidence or a separately tested registered-preset contract.
3. **Public README:** `package-project-evidence` write/derive remains `SERVING_CANDIDATE`. Explicit user approval and an `--allow-candidate` rerun are required before root README generation.
4. **Portfolio copy:** `portfolio-refiner` refine preflight remains `SERVING_STALE`; no canonical portfolio case-study copy was generated. `juhyeong-voice` was not read or applied.
5. **External release:** final product name, public GitHub remote, hosted fixture URL, public CI result, narrated YouTube video, private `/feedback` field, and final Devpost submission remain undone.
6. **Evidence limits:** no graph database, embeddings, persistent remote room, long-horizon autonomous simulation, generalized quest generation, practitioner result, or measured productivity improvement exists.

## Loop report

No trapped implementation loop occurred. The stale `.next` duplicate cache was removed once under a specific cache hypothesis. Evidence generation and production-server startup initially hit filesystem or localhost `EPERM` in the restricted shell, then passed with the required scoped permission. A direct Playwright invocation likewise exposed a test-results permission issue; the approved production-browser command then passed 10/10. No identical failure was retried without a new cause or permission boundary.

## Gate result

`LOCAL_RELEASE_VERIFIED_EXTERNAL_GATES_PENDING`: the bounded fixture product is implemented, visually inspected, committed, clean-clone reproduced, and exact-SHA smoke verified. Live-model use, public README/repository/deployment, narrated video, and final Devpost submission remain separate gates, so the Build Week entry itself is not yet submission-complete.

## Sub-brain status

Read-only. No Vault wiki, authority document, Progress, Memory, or skill was modified. Project decisions and improvement notes were recorded only in this repository.

## Next user action

Create ignored `.env.local` with `ENABLE_OPENAI_LIVE=true`, `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-5.6`, and `OPENAI_REASONING_EFFORT=medium`, then report only `키 설정 완료`. Do not paste the key into chat.
