# Core vertical slice RETURN

Status: `CORE_FIXTURE_RELEASE_CANDIDATE_VERIFIED_EXTERNAL_GATES_PENDING`

Date: 2026-07-15 KST

Branch: `codex/core-vertical-slice`

Starting commit: `0b24c866276cfe446fa313bda5ced3eaff052977`

Clean implementation proof commit: `fbb1b50497bff67eb6e83467cbdabc579a1c87c2`

Public evidence manifest SHA-256: `1c6bea39ca5c173b13b8af42a260ce3f08f84d832d40ad134380d586542af3ad`

## What changed

- Implemented the facilitator-facing Table: two local participant intents, creator-owned style constraints, character-scoped evidence, a derived canon/knowledge graph, accept/edit/reject, same-turn rebase, two deterministic transitions, and frozen replay.
- Hardened creator authority. The server replays the registered fixture run, rejects fabricated proposals and self-hashed canon, and reruns four run-only controls against the exact approved overlay hash before transition.
- Separated editable display wording from locked rule/claim semantics. The proposal card and graph always show the semantic authority; presentation copy is visibly non-authoritative and cannot conceal what transitions use.
- Rebuilt transition authority from the registered run and creator decision. Forged overlays, skipped snapshots, stale decisions, regressions, and a third step fail closed.
- Added a gated GPT-5.6 Structured Outputs adapter and preregistered same-model AB/BA style protocol. Both remain adapter/protocol evidence until real sanitized calls exist.
- Added production CI, exact build identity, clean-source build rejection, baseline security headers, exact-SHA deployment smoke, judge instructions, and a 366-word release-gated English narration.
- Reframed the Codex writing concern as the product brief: turn tacit voice and world standards into explicit, replayable harness layers instead of claiming raw prose superiority over Fable, Opus, or another system.

## Writing-harness claim boundary

The project treats familiar skepticism about generic default Codex prose as a design constraint, not a benchmark result. Codex served as the engineering partner that translated voice, canon, character knowledge, participant ownership, and world-state change into style, world, evidence, approval, and replay contracts. The creator still owns original style, taste, canon, scope, and final judgment. Current evidence proves the implemented mechanism and its deterministic regressions; it does not prove better prose, productivity gains, users, or model superiority.

## Verification

- Local release gate: PASS — evidence generation and seven-file manifest verification, ESLint, TypeScript, 26 Vitest files / 139 tests, privacy scan over 150 public candidates, Next production build, and 10 Playwright checks across desktop Chromium and mobile WebKit.
- Clean clone: PASS — `npm ci` installed 395 packages, audit reported 0 vulnerabilities, and `BUILD_SOURCE_OK fbb1b50497bff67eb6e83467cbdabc579a1c87c2` proved exact HEAD plus tracked/untracked cleanliness before the identified production build.
- Clean-clone release: PASS — the same 139 tests, privacy 150, production build, and 10 browser checks completed from the isolated copy.
- Exact-SHA production smoke: PASS — root fixture boundary, all declared security headers, cache-busted build identity, health, fixture demo, fresh approved-overlay replay, S0r→S1→S2 snapshot/transition/canon hash continuity, and public-live denial.
- Adversarial authority review: PASS — rule/claim semantic mutation, display-copy concealment, fabricated proposal, self-hashed overlay, stale snapshot, replay regression, and oversized display/patch inputs are closed or fail closed.
- Claim parity: ZERO drift outside this refreshed RETURN/receipt. Fable/Opus wording remains a design premise, GPT-5.6 remains `not_executed`, and no formal ontology, graph database, remote multiplayer, quest automation, productivity, adoption, or production-readiness claim is made.
- Public evidence: seven sanitized JSON artifacts; manifest SHA-256 `1c6bea39ca5c173b13b8af42a260ce3f08f84d832d40ad134380d586542af3ad` in both source and clean clone.
- `git diff --check`: PASS. No raw live prose, API key, personal absolute path, private session ID, Vault content, or private story asset entered the repository.

## Gates and remaining risks

1. **Real GPT-5.6 evidence:** `OPENAI_API_KEY` and `ENABLE_OPENAI_LIVE=true` were absent. Neither the sanitized live integration trace nor the four-call style capture exists; fixture/protocol evidence must not be relabeled.
2. **Public README:** `package-project-evidence` write/derive remains `SERVING_CANDIDATE`. Explicit user approval and `--allow-candidate` are required before root README generation.
3. **Portfolio copy:** `portfolio-refiner` refine preflight returned `SERVING_STALE` because its feedback dependency hash changed. Its canonical stack was not loaded, no portfolio case-study copy was generated, and `juhyeong-voice` was not read or applied.
4. **External release:** final product name, public GitHub remote, public CI result, hosted fixture URL, narrated YouTube video, private `/feedback` field, and final Devpost submission remain undone.
5. **Evidence limits:** no graph database, embeddings, persistent remote room, long-horizon autonomous simulation, generalized quest generation, practitioner result, or measured productivity improvement exists.
6. **SHA scope:** `fbb1b50497bff67eb6e83467cbdabc579a1c87c2` is the clean implementation proof. Any later documentation or release commit selected for hosting must be built and smoke-checked against its own exact SHA.

## Loop report

No trapped loop occurred. Failures were resolved with new falsifiable hypotheses: exact-overlay replay staleness, forged transition authority, semantic-edit bypass, human audit concealment, stale/wrong build certification, discontinuous transition proof, dirty-tree self-attestation, arbitrary local build labels, and stale hard-coded test wording. No identical failure was retried three times without a new hypothesis.

## Gate result

`PARTIAL`: the bounded fixture product and implementation proof commit are locally release-verified and adversarially audited. Live-model and external submission evidence remain outside the verified commit and block final Build Week submission.

## Sub-brain status

Read-only. No Vault wiki, authority document, Progress, Memory, or skill was modified. Project decisions and improvement notes were recorded only in the repository.

## Next user action

Configure `OPENAI_API_KEY` locally without pasting it into chat, then report only `키 설정 완료`. The next run will capture and verify the single live GPT-5.6 evidence path before any public claim changes.
