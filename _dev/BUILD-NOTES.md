# Build notes — decisions, improvements, and discussion queue

This file records implementation-time decisions without interrupting the critical path. It is public-safe: no personal paths, private prompts, credentials, or feedback-session IDs belong here.

## Loop sentinel

- If the same failing condition repeats three times without a new falsifiable hypothesis, stop the loop, record the exact command/error and attempted fixes here, and ask for the missing authority or external state.
- Do not weaken a contract, delete a required test, or relabel fixture evidence merely to turn a gate green.

## 2026-07-15 — Core start

### Accepted implementation decisions

1. Use Zod as the model-output schema authority and the OpenAI SDK's `zodTextFormat` for Responses Structured Outputs. This avoids maintaining a second hand-written JSON Schema.
2. The model proposes patches only. Deterministic code adds base overlay metadata and computes `proposalHash`; a model-supplied hash is never trusted.
3. Use one overlay hash as `canonHash`. Snapshot `canonHash` must equal the supplied overlay hash; no second canon-hash authority is introduced.
4. Hash payloads exclude their own hash fields. Canonical JSON sorts object keys and explicitly normalizes unordered ID sets while preserving ordered narrative and transition arrays.
5. Creator decision and SHA-256 calculation stay in server-side pure domain code. The browser stores only returned overlay/snapshot values and never reimplements hashing.
6. `presentEntityIds` means scene membership. `deceasedEntityIds` separately blocks living actions, so Hector may be present as a corpse in the funeral state.
7. Fixture and live requests are discriminated. Fixture mode requires a structured fixture ID; live mode forbids it. The public route rejects live requests, while the separate live-evidence adapter remains unavailable unless both a server-side API key and explicit enable flag exist.
8. The UI uses a finite workbench state machine and stateless API calls. React does not duplicate canon or transition rules.
9. Alias validation uses Unicode-aware registered-name boundaries. The regression suite caught and fixed the false match `Ithaca` inside `Ithacan`; fixture data was not weakened to hide the defect.
10. Public evidence is generated from the executable fixture flow. It records graph, proposal, decision/rebase, two transitions, a blocked third step, replay, and style-harness boundaries without presenting fixture output as a live model call.
11. The live adapter sends only participant intents, the selected original style profile, and character-scoped views/context. It omits the complete overlay, snapshot, facilitator graph, and top-level true-state evidence IDs from the model input.

### Verified implementation state

- Phase 0 contract suite: 26 tests passed at handoff.
- Integrated unit and API suite: 71 tests passed before the browser surface handoff; the final count is recorded by the release gate rather than frozen here.
- Final local release gate after the truth audit: the full unit/API suite and both Playwright projects passed.
- Frozen replay: five cases and eight stages, including proposal → creator decision/rebase → Step 1 → Step 2.
- Deterministic chain: `idle → watching → signal_seen`; a third step is blocked with the state hash unchanged.
- Public evidence generator: seven sanitized artifacts plus a SHA-256 manifest, including explicit `not_executed` style-ablation readiness.
- Privacy scan passed over 142 public candidates after evidence generation.

## 2026-07-15 — Post-core truth audit

### Gaps found and closed

1. The public run route still had code capable of constructing a live adapter when environment flags existed. The route now rejects every `modelMode: live` request before orchestration and contains no network-backed adapter.
2. Action evidence checks covered asserted claims but not unknown or inactive claims/rules. The validator now fails closed with typed violations and deterministic deduplication.
3. Creator edit/accept validated proposal hashes but not every patch reference against the selected World Pack. Decisions now require the World Pack, reject ID collisions and out-of-pack references, respect expansion policy, and forbid edit retargeting.
4. The browser recolored the pre-approval graph after acceptance instead of rendering a newly derived approved graph. The decision endpoint now returns a server-rebuilt graph bound to the new overlay/snapshot; browser tests prove the proposal edge disappears and approved overlay state appears.
5. The original style profile omitted an explicit cadence record. Cadence is now a registered constraint referenced by all fixtures and required by validation.
6. The Table did not put enough positive and exception evidence in the judge path. The server now executes a grounded Penelope control and a Helen tradition-conflict control; the UI shows used evidence, conflict IDs, canon hash, completion metrics, and replay reset.
7. The writing-harness thesis lacked a controlled test path. A preregistered same-GPT-5.6 AB/BA protocol now fixes model, brief, evidence, exact output schema, and reasoning; changes only the creator style bundle; disables retries/replacements; binds plan, capture, blind packet, ratings, receipt, and report hashes; and publishes only aggregate write-once evidence.
8. The decision endpoint initially trusted a client-supplied run result, then still accepted a self-hashed but unregistered base overlay. It now replays the fixture on the server, requires only proposal-scoped expansion violations, and accepts decisions only from the registered overlay v0 / snapshot S0 authority. Fabricated proposals and injected-canon bases return `409`.
9. Action evidence claims could bypass the temporal claim ledger. Every action claim must now appear in `usedClaimIds`, where activity and future-phase checks already fail closed.
10. Live evidence could become stale after a World Pack or request change. Sanitized evidence now binds the exact shared request, current pack hash, overlay, snapshot, style, and GPT-5.6 model family. The capture command reserves a write-once lock before the API call and records raw then sanitized output sequentially.
11. Error recovery could retain a stale approved graph. A retry now resets to the registered base authority, clears prior decision/transition state, and has desktop/mobile browser regression coverage.

### Verification after audit

- Local: full Vitest suite, privacy scan, production build, and both Playwright projects PASS.
- Fresh copy: clean `npm ci`, vulnerability audit, the same full suite, privacy scan, production build, and both browser projects PASS.
- Visual inspection: desktop and iPhone layouts show the problem statement, style constraints, proof controls, graph, and single-column responsive flow without overlap.
- Live style status: protocol verified, capture `not_executed`; no API key, raw prose, or public result exists.

### Improvement queue after required gates

- Add a Quest Consistency Linter only after vertical slice, live trace, browser smoke, privacy scan, Evidence Packet, and release rehearsal all pass with the required buffer.
- Run the preregistered same-model `default_instruction_control`/`profiled` AB/BA probe with objective checks and a condition-masked creator rubric; do not make model-vendor superiority claims.
- Consider graph DB or embeddings only after a representative multi-pack retrieval evaluation shows a measured need.

### External or discussion items

- `OPENAI_API_KEY` is currently absent from the process environment. Live GPT-5.6 evidence cannot be produced until a key is supplied locally; implementation and fixture verification continue meanwhile.
- Browser smoke is complete: all 8 Table-flow checks pass across desktop Chromium and iPhone/WebKit.
- `package-project-evidence` audit mode is certified. The latest write and derive preflights both return `SERVING_CANDIDATE`, not PASS; the skill requires explicit user approval and a rerun with `--allow-candidate`. Do not create README.md or portfolio copy before that approval. The user's ban on `juhyeong-voice` remains independent and binding.
- Final product name remains intentionally unlocked. The technical label stays `Narrative Knowledge Harness` until the user names it.

## 2026-07-15 — Release and authority hardening

### Gaps found and closed

1. An applied overlay originally reused the five-case baseline result even though the canon hash had changed. Applied and edited decisions now rerun four run-only safety controls against the exact new overlay hash; a failed regression returns `409` and the browser does not advance visible canon.
2. The transition route originally accepted a client-supplied, self-hashed overlay. It now reconstructs the registered fixture run and creator decision on the server, reruns approved-overlay controls, derives the authoritative prior snapshot, and rejects forged canon or skipped state.
3. Creator edit originally allowed rule semantics to travel behind a stable patch ID. Rule identity, kind, and semantic description plus every claim semantic field—including summary—now participate in edit authority. Only a separate `displayDescription` may change.
4. A first display-wording design kept machine semantics safe but let presentation text replace the only human-facing graph label. Proposal and graph audit surfaces now always show the locked semantic description and expose display wording separately as explicitly non-authoritative.
5. Production CI now pins Node 22.x and immutable action SHAs, installs from the lockfile, audits dependencies, requires exact HEAD plus a clean tracked/untracked tree through `build:identified`, and exercises `next start`. Hosting-provider Git SHA outranks a manual label. A separate manual deployment-smoke workflow accepts only a credential-free HTTPS origin, except loopback HTTP.
6. The deployment smoke rejects redirects and URL credentials, requires an exact build SHA from a cache-busted health response, checks every declared security-header directive, the fixture and health boundaries, the proposal/decision path, exact-overlay replay, S0r→S1→S2 snapshot/transition/canon hash continuity, and mandatory denial of public live requests.
7. Submission copy now treats familiar skepticism about Codex default prose versus writing-first systems as a design constraint, not a benchmark result. The defensible claim is that Codex translated tacit style/world requirements into inspectable harness layers; creator taste and final judgment remain human.

### Latest verification

- Integrated gate: 26 Vitest files / 139 tests PASS; evidence generation and seven-file manifest verification PASS; ESLint, TypeScript, privacy scan over 150 public candidates, and Next production build PASS.
- Production browser: 10/10 PASS across desktop Chromium and mobile WebKit, including failed-decision fail-closed behavior, recovery, semantic/display separation, exact-overlay replay, and two transitions.
- Clean clone of implementation proof commit `fbb1b50497bff67eb6e83467cbdabc579a1c87c2`: `npm ci` added 395 packages, vulnerability audit 0, evidence 7, 139 tests, privacy 150, `BUILD_SOURCE_OK`, production build, and 10 browser checks PASS.
- Exact-SHA deployment smoke from that clean clone: PASS for `root-boundary`, `security-headers`, `build-identity`, `health`, `fixture-demo`, `approved-overlay-replay`, `two-step-transition`, and `live-route-denial`.
- Independent adversarial re-audit: rule/claim semantic mutation P1 and human-audit concealment P2 are closed. Duplicate patches fail closed; patch ordering is normalized.

### Failures with new hypotheses

- A generated `.next/types` duplicate-file collision was removed as stale local build output; source contracts were unchanged.
- Two unit failures came from tests assuming the target rule was array index zero and that proposal and accepted-fixture wording were identical. Tests now locate the stable rule ID and compare against the fixture authority.
- Two browser failures came from the same stale hard-coded wording assumption. The browser now captures the rendered locked semantic description and proves it remains identical after display editing and in the graph.
- No identical failure was retried three times without a new falsifiable hypothesis; the loop sentinel did not fire.

### Remaining discussion and external gates

- The stateless transition route proves an authorized state chain, not historical occurrence of an earlier HTTP request. Persistent room chronology would require accounts, storage, or signed session receipts and remains outside the MVP.
- Claim visibility/source ID arrays remain order-sensitive in edit authority. This is fail-closed and no claim-edit UI exists; normalize only if a future semantic migration contract treats equivalent set order as editable.
- `OPENAI_API_KEY` and `ENABLE_OPENAI_LIVE=true` are still absent, so one sanitized GPT-5.6 integration trace and the four-call style probe remain unexecuted.
- `portfolio-refiner` refine preflight returned `SERVING_STALE` because the feedback dependency hash changed. No canonical portfolio copy was produced, and `juhyeong-voice` was not read or applied.
- README write/derive remains `SERVING_CANDIDATE` under `package-project-evidence`; public README generation still requires explicit user approval plus an `--allow-candidate` rerun.
- Product naming, public remote/CI, hosted demo, narrated YouTube video, private `/feedback` field, and final Devpost submission remain external release work.

## 2026-07-15 — Fixture truthfulness and live-capture hardening

### Gaps found and closed

1. The public workbench displayed editable participant text while the fixture adapter always selected one registered draft ID. Editing prose therefore implied causal composition that did not exist. The public path now loads the exact registered replay stage, freezes both synthetic intents and the style profile, labels the run as a frozen rehearsal, and states that prompt prose does not branch fixture output. Arbitrary facilitator-collected intents remain a gated live-path claim.
2. The red-sail fixture previously exposed only one playable line and hid the second intent in metadata. Penelope and Telemachus now each authorize a line and reciprocally reference the other intent as a contributor; the UI shows the stable lineage and 2/2 coverage.
3. Style constraints were counted but not audited. A visible style receipt now machine-checks only `max_words`, lists the six subjective constraints as `creator review required`, and keeps `Referenced ≠ verified` plus `Live AB/BA not measured` visible.
4. Character-scoped retrieval required graph interpretation. A compact `Who can know this?` table now distinguishes narrator-visible Ogygia, Penelope-withheld Ogygia, and Penelope's uncertain belief before the detailed graph.
5. The creator gate was separated from the candidate by a long graph. The gate now appears immediately after the candidate and style receipt; graph-as-text is collapsed by default.
6. The final screen lacked a production-team handoff surface. A collapsed review packet now organizes fixture intent lineage, evidence, canon delta, state, conflicts, and replay while explicitly denying production-readiness evidence.
7. Live capture could dispatch without a durable attempt record, leave a stale lock or partial pair, and depended on the parent shell exporting `.env.local`. The command is now import-safe, prevalidates configuration and completed outputs, reserves a prose-free recovery sentinel plus exclusive lock before dispatch, writes append-only receipts under ignored raw storage, and publishes raw then sanitized artifacts with same-directory temporary files plus atomic no-clobber hard links. Receipt-write failure retains the sentinel and lock for manual recovery; evidence generation refuses unresolved recovery state and requires an authority-bound completed receipt before publishing verified readiness. A target created during the preflight-to-publish race is preserved; an ordinary incomplete pair rolls back; a typed failure with a durable receipt permits explicit retry. Node 22 loads `.env.local` for both live commands.
8. `/api/health` hard-coded live evidence as false, while a status-only guard would have accepted a malformed future artifact. It now requires the full generated readiness evidence type, GPT-5.6 model family, authority hashes, sanitized path, and public-privacy flag, so later health cannot disagree with the evidence contract.
9. Freezing the browser inputs did not initially freeze the server authority: a caller could still post altered brief or intent text beside the registered draft ID, then carry that relabeled request into decision and transition routes. All three public boundaries now require canonical equality with the exact registered replay stage, including brief, intents, draft, style, task, overlay, and snapshot. Valid-schema mutations fail closed.

### Evidence boundary decision

- The public fixture proves the registered pair's lineage, validators, creator authority, state chain, and replay. It does not prove arbitrary free-text composition or a live GPT-5.6 result.
- To reopen arbitrary public composition, require either a sanitized real GPT-5.6 run with a reviewed reviewer-access path or a separately specified set of registered presets whose exact fixture branching is tested. Do not restore editable text around a fixed draft.
- The production review packet is an organization surface, not practitioner evidence, productivity evidence, or production readiness.

### Verification in this pass

- Focused health, live-capture, and API route suite: 14/14 PASS.
- ESLint: PASS.
- TypeScript with incremental cache disabled: PASS.
- `git diff --check`: PASS.
- Desktop/mobile Table browser suite from the UI lane: 10/10 PASS before final combined recertification.
- A duplicate generated `.next` cache was deleted once before recertification. The failure had a specific stale-cache hypothesis; no identical blind retry occurred and the loop sentinel did not fire.

Combined current-tree recertification after the authority fixes:

- Evidence generation and seven-file manifest verification: PASS; manifest SHA-256 `5d1d725860a45967c83fc3d6b0b20f58f58b483397e76a821d95d8dbd92b5f18`.
- ESLint and non-incremental TypeScript: PASS.
- Vitest: 30 files / 156 tests PASS.
- Privacy scan: 155 public candidates PASS.
- Next production build: PASS.
- Production Playwright: 10/10 PASS across desktop Chromium and mobile WebKit.
- Visual inspection: desktop candidate, mobile candidate, and completed desktop flow with the review packet open show no clipped controls, overlap, or fixture/live ambiguity.
- Final exact-SHA clean-copy and deployment smoke remain intentionally after the candidate commit; their authority is stored in the ignored private release record to avoid a self-referential documentation commit.

### Remaining discussion and release gates

- A real GPT-5.6 trace is still required before the submission may say arbitrary participant intents produced the candidate or add GPT-5.6 to completed live-use claims.
- The four-call same-model style probe remains optional evidence beyond the minimum one-call integration gate; without it, the UI and copy must continue to say `Live AB/BA not measured`.
- Root README generation remains behind the explicit `SERVING_CANDIDATE` approval gate. Final naming, remote, hosted demo, video, private `/feedback` field, and Devpost submission remain external actions.
