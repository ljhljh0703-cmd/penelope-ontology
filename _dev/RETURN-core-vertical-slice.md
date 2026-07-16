# Core vertical slice RETURN

Status: `CORE_FIXTURE_COMPLETE_CLI_RETRY_TERMINAL_NO_LIVE_EVIDENCE`

Date: 2026-07-15 KST

Branch: `codex/core-vertical-slice`

Starting commit: `0b24c866276cfe446fa313bda5ced3eaff052977`

Release authority: the expanded source tree passes the full local gate after the latest CLI debt fixes. This tracked RETURN intentionally does not self-certify its own commit. Exact-SHA clean-copy authority must be generated after the final tracked commit and stored only in ignored `private-submission/release-record.json`.

Public evidence manifest SHA-256: `5d1d725860a45967c83fc3d6b0b20f58f58b483397e76a821d95d8dbd92b5f18`

## What changed

- Implemented a facilitator-facing Table that honestly replays one registered, frozen two-intent scene rather than presenting a fixed fixture as arbitrary text composition. Penelope and Telemachus each authorize a playable line and retain reciprocal contributing-intent lineage.
- Added a visible responsibility contract, style receipt, and `Who can know this?` table. The UI machine-checks only the output bound, labels six voice constraints for creator review, and distinguishes narrator-visible, character-withheld, and character-uncertain knowledge.
- Moved the creator gate before the detailed graph, collapsed graph text by default, and added a production review packet for human handoff. The packet is explicitly fixture evidence, not practitioner or production-readiness evidence.
- Bound public run, decision, and transition routes to the exact registered replay request. Changed brief, intent, draft, style, task, overlay, or snapshot data cannot relabel or authorize the fixed fixture.
- Preserved creator authority: accept/edit/reject is server-replayed; display wording remains separate from locked semantics; accepted overlays rerun four controls before a two-step `idle → watching → signal_seen` state chain.
- Hardened the gated GPT-5.6 capture command with Node 22 `.env.local` loading, preflight checks, a pre-dispatch recovery sentinel, an exclusive lock, prose-free append-only receipts, atomic no-clobber publication, target-race preservation, partial-pair rollback, and explicit retry. Receipt-write failure retains the sentinel and lock instead of erasing the attempt.
- Made evidence generation and health readiness require the full generated evidence type, GPT-5.6 model family, authority hashes, completed capture-receipt binding, sanitized path, and public-privacy contract instead of a status string.
- Added separate pre-submit and post-submit readiness gates that recompute local evidence, live-check available public artifacts, redact private values, and activate the style AB/BA requirement only when a measured style-control claim is enabled.
- Updated the judge guide, Devpost draft, 378-word narration, shot list, evidence ledger, and decision log to the same fixture/live/style claim boundary.
- Executed the separately approved ChatGPT-authenticated Codex CLI primary attempt once. The child process exited nonzero with `codex_cli_process_failed`; a private terminal receipt consumed the authority. Actual remote model execution, response identity, and usage were not observed, and no raw or sanitized live evidence was produced. The receipt remains immutable and the primary command is replay-blocked.
- Added a one-time `retry-1` authority instead of reopening primary. It binds the exact primary receipt bytes, registered input, prompt, reviewed app-bundled command identity, execution contract, and an OpenAI-SDK-normalized strict schema. The retry was separately approved, passed preflight, and dispatched once. Its child exited zero after five parseable JSONL envelopes, then the adapter failed closed on `codex_cli_event_type_unrecognized`. The immutable receipt is `retryable: false` and contains no accepted usage, raw capture, sanitized result, actual model, or response ID. Because it predates the observation patch, the exact unknown type is unrecoverable; later failure receipts retain up to sixteen safe event/item-type pairs plus overflow state.
- Added a fail-closed Myth Atlas intake boundary. The initial free-form machine handoff failed the Penelope consumer schema; corrected packaging revision `v1.0.1` retains manifest `schemaVersion: "1.0.0"` and is now accepted only as `quarantined_private_reference` after schema and byte-integrity checks across 16 external assets totaling 2,489,820 bytes. The package reports ten exact-passage claim candidates, five `video_reported` items, and six pending items. Creator review, rights, culture, producer-provenance, video, and pending warnings remain, and no asset was imported or accepted as public evidence or canon.
- Used the quarantined package for one deterministic compatibility analysis. The path-free report binds intake receipt `5b5f390aed77c9c82eb3df4a419bbce3d7078c5c1994921f1197ee71bbb1977b` to registered World Pack `8e73033c7f67e6fc501b893dd905157fde6dfb746c757f74ed017c1639167f57`, returns `analysis_only_no_import`, and keeps runtime, model-input, canon, and public eligibility false with zero eligible claims. It reads no claim prose and changes no fixture, graph, overlay, or canon.

## Writing-harness claim boundary

The project treats familiar skepticism about generic default Codex prose as a design constraint, not a benchmark result. Codex served as the engineering partner that translated voice, canon, character knowledge, participant ownership, and world-state change into explicit style, world, evidence, approval, and replay layers. The creator still owns original style, taste, canon, scope, and final judgment. Current evidence proves the implemented mechanism, frozen lineage, deterministic checks, and regressions. It does not prove better prose, a measured style effect, arbitrary-intent generation, productivity gains, users, or model superiority over Fable, Opus, or another system.

## Verification

- Evidence generation and seven-file manifest verification: PASS.
- ESLint and TypeScript with incremental cache disabled: PASS.
- Vitest: 60 files / 429 tests PASS.
- Adversarial evidence, live-bundle, submission-collector, privacy, and generated-cache regressions are included in the full suite.
- Privacy scan: 237 public candidates PASS, including malformed/trailing PNG payloads, UTF-16 text, unknown-binary printable strings, and textual/EXIF metadata.
- Next production build: PASS.
- Production browser: 10/10 PASS across desktop Chromium and mobile WebKit, including frozen inputs, reciprocal lineage, style receipt, knowledge boundary, creator decision, display/semantic separation, exact-overlay replay, failure recovery, and two transitions.
- Visual inspection: desktop candidate, mobile candidate, and completed desktop flow with the review packet open show no clipped controls, overlap, or fixture/live ambiguity. Five public-safe 1440×900 gallery captures were inspected and bound to `docs/assets/demo/manifest.json` by SHA-256; the release gate also rejects duplicate decoded pixels hidden behind different PNG compression.
- `git diff --check`: PASS. No raw live prose, API key, personal absolute path, private session ID, Vault content, or private story asset entered the repository.

The verification results above include the CLI debt fixes and health-signal correction and prove the synchronized source tree through evidence, lint, typecheck, tests, privacy, build, and trace privacy. The product-surface browser gate remains 10/10. This tracked RETURN does not self-certify a commit SHA, public CI, hosted deployment, or a live model result.

The exact-SHA clean-copy and deployment-smoke authority is generated only after each tracked release-candidate commit. Its local record belongs in ignored `private-submission/release-record.json`, preventing a self-referential proof commit; any SHA mismatch invalidates it. Hosted-origin and public-CI proof remain separate.

## Gates and remaining risks

1. **Real GPT-5.6 evidence:** primary ended in a terminal process failure. Separately approved `retry-1` passed preflight and dispatched once, but the adapter rejected its event stream before accepting any model result, usage, provenance, raw capture, or sanitized evidence. Both authorities are consumed and no `retry-2` exists. Neither transport has a sanitized integration trace, and the four-call style capture does not exist. Fixture, approval, preflight, dispatch, and failure receipts must not be relabeled as a completed live result; CLI evidence must not be relabeled as a Responses API response.
2. **Arbitrary participant intents:** the live contract accepts them, but the public fixture proves only its registered frozen pair. Reopen the public claim after sanitized live evidence or a separately tested registered-preset contract.
3. **Public README:** the approved writing pipeline reports `SERVING_STALE`. Refresh its authority hashes before root README generation; do not bypass the gate or draft from memory.
4. **Portfolio copy:** `portfolio-refiner` refine preflight remains `SERVING_STALE`; no canonical portfolio case-study copy was generated. `juhyeong-voice` was not read or applied.
5. **External release:** **Penelope Ontology** is name-locked, while public GitHub remote, hosted fixture URL, public CI result, narrated YouTube video, private `/feedback` field, external name parity, and final Devpost submission remain undone.
   The new readiness verifier reports these as stable blocked check IDs and cannot turn their absence into a PASS.
6. **Evidence limits:** no graph database, embeddings, persistent remote room, long-horizon autonomous simulation, generalized quest generation, practitioner result, or measured productivity improvement exists.
7. **External world assets:** Myth Atlas corrected packaging revision `v1.0.1` with manifest schema `1.0.0` is quarantined as private reference only after schema and byte-integrity checks across 16 assets / 2,489,820 bytes. Its producer-reported counts remain ten exact-passage candidates, five `video_reported` items, and six pending items; all six intake warnings plus Penelope-owned public/canon review remain open, and no World Pack import occurred.
8. **Release authority:** full local recertification passes. Clean/exact-SHA status is a post-commit fact stored only in the ignored release record; public CI and hosted deployment remain separate.

## Loop report

A diagnostic loop did occur before the retry. Codex spent too long hardening schemas, retry architecture, and authentication hypotheses before proving which executable was running. The creator stopped that loop and required a direct CLI/alternate-session test. That exposed stale PATH `codex-cli 0.142.5`; the ChatGPT app-bundled `0.144.2` reached `gpt-5.6-sol` under the same login. The correction belongs to the creator and is now enforced as the diagnostic order: executable identity → exact version → auth → one synthetic reachability probe → only then schema or harness changes. The later retry found a distinct parser-compatibility failure and did not authorize another call. Separately, byte-identical `.next/types/* 2.ts` duplicates remain handled by the read-only, path-safe normalizer rather than deletion.

## Gate result

`CLI_RETRY_TERMINAL_NO_LIVE_EVIDENCE`: the bounded fixture product and full local tree are verified. Primary and separately authorized `retry-1` are both terminal and cannot be reused. Retry reached a zero process exit but failed at event-stream compatibility without accepted model evidence. The receipt chain remains private and byte-bound, legacy parsing is compatible without mutation, reviewed command identity is preserved, and no `retry-2` exists. Exact-SHA clean-clone authority is a post-commit ignored record, not a tracked claim. Live-model use, public README/repository/deployment, narrated video, and final Devpost submission remain separate gates, so the Build Week entry is not submission-complete.

## Sub-brain status

Read-only. No Vault wiki, authority document, Progress, Memory, or skill was modified. Project decisions and improvement notes were recorded only in this repository.

## Next user action

Do not rerun either CLI attempt. For every final tracked candidate, refresh the ignored exact-SHA clean-copy release record. A future live-evidence attempt requires a new, explicitly approved authority contract or the separate Responses API path; neither may relabel the consumed retry or its terminal receipt.
