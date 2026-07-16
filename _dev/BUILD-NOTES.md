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
- `package-project-evidence` audit mode is certified. The approved README writing pipeline currently reports `SERVING_STALE`; refresh its authority hashes before generating README.md. The user's ban on `juhyeong-voice` remains independent and binding.
- The creator approved **Penelope Ontology** as the final product name on 2026-07-15. The name is now fixed across the repository UI and submission copy; external Devpost, hosted demo, and video parity still require readback.

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
- README writing remains `SERVING_STALE` under `package-project-evidence`; refresh the approved authority path before public README generation.
- **Penelope Ontology** naming is approved. Public remote/CI, external name parity, hosted demo, narrated YouTube video, private `/feedback` field, and final Devpost submission remain external release work.

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
- A duplicate generated `.next` cache was deleted once before recertification as a historical cleanup. That cleanup is not the current normalizer: the replacement only validates byte identity and path safety, relies on a narrow generated-file exclusion, and never deletes files. The failure had a specific stale-cache hypothesis; no identical blind retry occurred and the loop sentinel did not fire.

Combined current-tree recertification after the authority fixes:

- Evidence generation and seven-file manifest verification: PASS; manifest SHA-256 `5d1d725860a45967c83fc3d6b0b20f58f58b483397e76a821d95d8dbd92b5f18`.
- ESLint and non-incremental TypeScript: PASS.
- Vitest: 30 files / 156 tests PASS.
- Privacy scan: 155 public candidates PASS.
- Next production build: PASS.
- Production Playwright: 10/10 PASS across desktop Chromium and mobile WebKit.
- Visual inspection: desktop candidate, mobile candidate, and completed desktop flow with the review packet open show no clipped controls, overlap, or fixture/live ambiguity.
- Exact-SHA clean-copy and deployment smoke passed after the candidate commit; their authority is stored in the ignored private release record to avoid a self-referential documentation commit.

### Remaining discussion and release gates

- A real GPT-5.6 trace is still required before the submission may say arbitrary participant intents produced the candidate or add GPT-5.6 to completed live-use claims.
- The four-call same-model style probe remains optional evidence beyond the minimum one-call integration gate; without it, the UI and copy must continue to say `Live AB/BA not measured`.
- Root README generation is blocked by a `SERVING_STALE` writing pipeline. **Penelope Ontology** naming is approved; remote, external name parity, hosted demo, video, private `/feedback` field, and Devpost submission remain external actions.

## 2026-07-15 — Post-commit release reconciliation

- The working repository and an independent clean clone both passed the exact-SHA identified release gate, 30 files / 156 tests, production build, 10 browser checks, and deployment smoke. The clean clone installed 395 packages and reported zero audit vulnerabilities.
- Tracked status files had still described this proof as historical or pending. The checklist, command center, evidence ledger, START-HERE, AGENTS, RETURN, and usage receipt were reconciled in one bounded documentation pass.
- The current exact commit cannot be written into a tracked file without changing that commit. `private-submission/release-record.json` therefore remains the post-commit authority and is refreshed only after the final tracked candidate is verified.
- User-dependent choices are isolated in `_dev/PENDING-EXTERNAL-DECISIONS.md`; submission-copy fields are isolated in `docs/submission/SUBMISSION-FIELDS.md`.
- No loop sentinel fired. This is one planned reconciliation commit followed by one post-commit recertification; no tracked file is edited after that proof.

## 2026-07-15 — Submission closure gate

- A final checklist could drift from actual release state, so the project now has distinct `pre-submit` and `post-submit` machine gates instead of treating a manually checked box as proof.
- The gate parses a strict gitignored submission record, recomputes release and gallery manifest hashes, requires the release-record SHA to equal clean Git HEAD, reruns the public privacy scan, and reuses the full live-evidence predicate.
- When external locators exist, it checks the public GitHub branch head, the exact GitHub Actions `verify` check identity, hosted exact-SHA deployment smoke, named Devpost page reachability, and public YouTube metadata under 180 seconds. Product/Codex/GPT narration content and final Devpost submission remain explicit owner/plugin receipts because their meaning cannot be inferred safely from a URL alone.
- Output contains stable check IDs only. It never echoes repository, deployment, video, or feedback values. `private-submission/` and `artifacts/live/` must remain untracked.
- The style AB/BA gate is conditional: it becomes mandatory only when `measuredStyleControl` is enabled. The default evidence-safe submission makes no measured prose-improvement claim.
- The first current run is intentionally BLOCKED on the same external gates already recorded in the command center. That failure is correct behavior, not an implementation loop.
- Initial current-tree verification after adding the gate: evidence 7/7, ESLint, non-incremental TypeScript, 31 Vitest files / 161 tests, privacy scan over 169 public candidates, and the Next production build all PASS.
- An adversarial collector audit then closed six false-PASS paths: stale hard-coded test counts, arbitrary record paths, URL-only Devpost completion, top-level-only manifests, third-party `verify` checks, and substring-only project-name parity.

### Adversarial submission-gate closure

1. The evidence verifier previously reduced manifest entries to basenames, allowing a `../` locator to hash a different file. Manifest paths are now canonical `artifacts/evidence/<name>.json` locators; directory and child symlinks, duplicates, malformed counts, and path escapes fail closed. A reproduced traversal fixture is permanently tested.
2. Live readiness previously trusted booleans and hash-shaped strings. Health and submission gates now open the readiness, sanitized result, capture receipt, and manifest; hash their exact bytes; validate strict schemas; rebind the completed receipt; and recompute the expected authority from the current World Pack, overlay, snapshot, and live request.
3. An earlier deletion-based `.next/types` design could have followed a directory symlink outside the repository. Its replacement is read-only: the normalizer realpath-checks both generated roots, rejects symlinked roots or leaves, and verifies duplicate/canonical byte identity without deleting either file; TypeScript excludes only the exact generated duplicate pattern after validation. Its CLI uses a distinct error exit from a normal readiness block.
4. Evidence-manifest file counts are dynamic, so the truthful count can advance from seven to nine or more after live/style artifacts. The release record must equal the actual manifest length.
5. Gallery verification now requires the five exact expected screenshots in order, distinct file hashes and decoded-pixel hashes, complete CRC-valid and zlib-decodable 1440×900 RGB PNGs, no textual/EXIF metadata, and both visual and privacy inspection receipts. Recompressing one image five ways cannot satisfy the gate. Visible screenshot content remains a human inspection boundary.
6. Measured style claims are controlled by tracked `docs/submission/CLAIM-CONTRACT.json`; changing the ignored receipt alone cannot suppress the AB/BA proof gate. If enabled, the gate binds the exact plan, four-call sanitized receipt, report, readiness, and manifest, checks score ranges and internal totals, and rejects readiness-only self-report. The default remains mechanism-only and makes no measured prose-effect claim.
7. `/feedback` accepts only a Codex-session UUID shape. Hosted smoke accepts only supported public deployment-provider origins. Post-submit Devpost readback must match the final name, track, description file SHA-256, repository, hosted demo, and video.
8. Release-copy scanning separates the allowed Fable/Opus perception-led brief from outcome claims. It rejects prose/style improvement assertions, comparative-gap claims, and cross-model superiority while requiring every current public copy surface to remain mechanism-only under the default claim contract.
9. Manifest proof now requires every public evidence child to be a tracked regular file whose working bytes equal its release-HEAD blob. Only the seven baseline artifacts and complete live/style optional groups are registered; ignored children, working-tree-only replacements, partial groups, and invented claim JSON fail closed.
10. The completed live-capture receipt commits to the canonical sanitized result, so one request/response receipt cannot certify contradictory run status, violation, draft, graph, or state summaries. Public PNG scanning now rejects malformed chunks, CRC failures, bytes after exact IEND, UTF-16 secrets, and printable sensitive strings embedded in unknown binaries.
11. Recertification at that point in the closure sequence: evidence 7/7, ESLint, non-incremental TypeScript, 37 Vitest files / 203 tests, privacy scan over 179 public candidates, and Next production build all PASS. The later current-tree authority is recorded below.
12. Public live evidence no longer self-certifies from tracked files alone. The final gate requires the ignored raw run and exactly one matching ignored attempt receipt, recomputes the sanitized result against the current World Pack and request, and requires canonical equality with the tracked public evidence. The style gate likewise recomputes its public receipt and report from the ignored raw capture, masked packet, and creator ratings.
13. **Superseded diagnosis.** The initial PATH-based probe used stale `codex-cli 0.142.5`, so its failure did not prove ChatGPT-account or model incompatibility. The creator stopped the speculative schema/auth loop and required a direct executable/version matrix. The ChatGPT app-bundled `codex-cli 0.144.2` reached `gpt-5.6-sol` under the same login. The root cause was executable identity/version selection; this correction must not be rewritten as an agent-only discovery.

## 2026-07-15 — Name lock and current-tree truth reconciliation

- The creator approved **Penelope Ontology**. Product UI, metadata, Devpost draft, submission fields, and narration use the same name. The name describes the structured world/knowledge/governance product; the implementation still calls its derived visualization a canon/knowledge graph and does not claim RDF/OWL, a graph database, or formal Semantic Web compliance.
- The latest current-tree gate reported evidence 7/7, ESLint, non-incremental TypeScript, 46 Vitest files / 344 tests, privacy scan over 199 public candidates, production build with 10 clean Next trace manifests, and 10 production-browser checks PASS.
- The working tree contains uncommitted changes. Exact-SHA clean-clone and deployment proof belongs to the earlier committed candidate until the current tree is committed and recertified.
- $100 Build Week Codex credits are user-reported received. API-platform credit/key applicability is separate. A Codex CLI dispatch occurred later, but no model result, usage, provenance, raw capture, or sanitized evidence was accepted.
- The approved README writing pipeline reports `SERVING_STALE`; no root README was created or edited.

## 2026-07-16 — CLI retry terminal truth and debt closure

- The separately approved `retry-1` used the app-bundled `codex-cli 0.144.2`, passed preflight, and dispatched once. The process exited zero after five parseable JSONL envelopes with thread/turn start, then failed closed on `codex_cli_event_type_unrecognized`.
- The immutable pre-patch receipt is `retryable: false` and contains no accepted usage, raw capture, sanitized evidence, actual model, or response ID. It did not retain the exact unknown event/item type, so that subtype is unrecoverable. No `retry-2` exists.
- Receipt-reader compatibility now supplies empty observation defaults without rewriting or rehashing the immutable receipt. New failures still emit up to sixteen safe event/item-type pairs plus overflow state explicitly.
- Evidence reconstruction now recovers the exact reviewed command identity from the private review packet instead of defaulting to the current PATH command. The retry authority remains bound to the exact primary receipt bytes; whitespace-only drift is tested and rejected.
- Codex CLI version gating now follows SemVer prerelease precedence. Command override failures use an allowlisted typed error across review, approval, preflight, and capture instead of collapsing into `unexpected_failure`.
- Focused verification passed at 7 files / 54 tests. After truth-surface synchronization, the full current-tree gate also passed: evidence 7/7, ESLint, non-incremental TypeScript, 60 Vitest files / 428 tests, privacy scan over 237 public candidates, production build, and 10 clean Next trace manifests. Exact-SHA fresh-copy recertification remains next.
