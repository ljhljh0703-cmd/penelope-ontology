# Evidence ledger

Evidence states: `verified`, `source-backed`, `fixture-only`, `historical`, `planned`, `target`, `blocked`, `prohibited`.

| ID | Claim | State | Required proof |
|---|---|---|---|
| build-week-registered | Eligible participant registration matches the project identity | verified | authenticated registration check with private identity fields redacted |
| devpost-project-published | Honest in-progress Devpost project page is public | verified | public project read-back; project state `published` |
| codex-credit-received | $100 Build Week Codex credits were received | source-backed | user report on 2026-07-15; Codex availability is separate from API-platform credit/key applicability |
| scaffold-created | Local Next.js/TypeScript scaffold exists | verified | repository files and local Git status |
| world-pack-contract | Demo World Pack satisfies referential schema | verified | `tests/unit/world-pack-schema.test.ts` plus filesystem and Phase-0 contract checks |
| structured-draft-contract | Model draft and strict JSON Schema agree | verified | `tests/unit/model-draft-contract.test.ts` |
| fixture-boundary | Fixture and live response identities cannot cross | verified | `tests/unit/fixture-trace.test.ts` |
| public-fixture-authority | Public run, decision, and transition routes accept only the exact registered red-sail replay request and reject fixture relabeling | verified | canonical equality against the replay stage plus mutations of brief, intent, draft, style, task, overlay, and snapshot at all three route boundaries |
| replay-fixture-contract | World Pack and replay file have exact, valid ID parity | verified | `tests/unit/replay-case-contract.test.ts` |
| app-builds | Production application builds | verified | `npm run verify` and Next production build exit 0 |
| approved-table-surface | The browser implements a registered frozen two-intent rehearsal with visible lineage, style receipt, knowledge boundary, graph, creator gate, production review packet, and two-step flow | verified | 10 production Playwright checks across desktop and iPhone/WebKit plus fresh candidate/completion visual inspection |
| story-workbench-runtime | A bounded choice or direct action can produce a validated next scene, echo an earlier consequence, and close a three-scene Red-Sail arc without committing invalid prose | verified | story contracts, scope/resolution/turn/API tests, two registered fixture branches, fail-forward tests, actor/reserved-action checks, and closure invariants |
| story-browser-actual-api | The Story Workbench completes its real fixture API flow on desktop and mobile | verified | `tests/browser/story-real-api.spec.ts`; 2/2 Playwright checks passed with the actual story routes rather than route mocks |
| dependency-audit | Installed dependency graph has no reported npm vulnerabilities | verified | `npm audit --json`, 2026-07-15, total 0 |
| core-contracts-locked | The eight demo-critical contract groups are represented and tested | verified | contract and malformed-input suite plus schema/hash fixture audit |
| retrieval-deterministic | Retrieval order and character views are stable for fixed inputs | verified | repeat-input and character-scope tests |
| gpt56-adapter | GPT-5.6 Responses adapter uses strict Structured Outputs and typed failure paths | verified | injected-client tests; no network call |
| gpt56-integrated | A real response is independently attributable to GPT-5.6 | blocked | no Responses API response exists, and the completed Story Workbench Codex CLI run reports only `requestedModel: gpt-5.6-sol` while `actualModel` and `responseId` remain `null` |
| codex-cli-adapter | The legacy approval-bound ChatGPT-authenticated Codex CLI adapter can request `gpt-5.6-sol` through a bounded no-tool narrative path | verified | adapter, event-stream, process-isolation, strict-schema, semantic-validation, typed command-resolution, SemVer-precedence, and typed-failure tests plus two terminal dispatch receipts; that lane accepted no model result as evidence |
| codex-cli-authority | CLI dispatch authority binds the exact registered request, World Pack, model input, prompt, output schema, reviewed command identity, execution contract, and previous-receipt bytes to one user-supplied SHA | verified | private review-packet generation, attempt-specific write-once approval, exact previous-receipt SHA binding including whitespace drift, reviewed-command reconstruction, mismatch, stale-packet, cross-attempt denial, and adapter-level authority tests; both approvals and dispatches are consumed |
| codex-cli-transaction | One approved CLI dispatch cannot silently retry after terminal success, model failure, parser/semantic/sanitization failure, or persistence failure | verified | exclusive lock/reservation, terminal-receipt, receipt-persistence recovery, approval-reuse, raw/private, sanitized/public, manifest all-or-none, immutable legacy-receipt compatibility, and focused debt-recertification tests |
| codex-cli-integrated | The legacy approval-bound Red-Sail evidence lane captured an accepted Codex CLI result | blocked | primary ended in a nonzero process failure. Separately approved `retry-1` passed preflight and dispatched once, then terminally failed on `codex_cli_event_type_unrecognized` after exit zero. Five parseable envelopes and thread/turn start were observed, but the pre-patch receipt did not retain the exact unknown type, accepted usage, raw capture, sanitized result, actual model, or response ID. Both authorities are consumed and no `retry-2` exists |
| story-codex-cli-generation | The separate user-authorized Story Workbench lane generated two consecutive scenes and completed one bounded session through the ChatGPT-authenticated Codex CLI | verified | `npm run story:demo -- --transport codex_cli --branch quiet`; Scene 2 output SHA-256 `e00dec6e24c3b13f241f3b763f88816eb09ed814569fbacaa73b63aa487eefbf`, Scene 3 output SHA-256 `4f2ad711ab0199a425efd17e12bba7bee856aa0b2d4f3f62cf617b04966ebf1f`; both exit codes 0, no fixture fallback, session completed. Requested model only; actual model and response ID remain unknown |
| story-live-prose-quality | The final generated three-scene arc meets the creator's writing standard | blocked | automated gates and a provisional external rubric pass, but the creator verdict in `docs/STORY-LIVE-CREATOR-REVIEW.md` remains `pending` |
| registered-output-locale | The submission live request accepts only `outputLocale: "en"`, includes it in the request hash, and rejects non-Latin letter scripts before evidence acceptance | verified | strict live-request schema, model-input test, canonical request-hash assertion, Latin-script gate tests, and creator-review workflow tests; this is not semantic English detection and no live prose has been reviewed yet |
| live-capture-transaction | A dispatched live attempt cannot silently overwrite a canonical pair, disappear without a durable prose-free receipt or recovery sentinel, or retry without new creator authority | verified | request-bound primary approval, fresh preflight, exclusive lock, pre-dispatch sentinel, append-only ignored receipts, receipt-failure recovery tests, atomic no-clobber publication, target-race preservation, partial-pair rollback, and a separate-approved fixed `retry-1` only after a same-request retryable typed failure |
| live-proof-binding | The local release gate binds the ignored raw run to registered scenario semantics, sanitized evidence, the completed primary-or-retry receipt chain, manifest bytes, and current World Pack/request authority | verified | exact receipt/hash checks, semantic recomputation, retry-chain tests, manifest child hashes, current-authority recomputation, and stale/fabricated bundle tests |
| health-readiness-signal | `/api/health` states only whether a strict verified tracked readiness record was built into the deployment | verified | honest boolean `liveEvidenceReadinessRecorded` field plus route and deployment-smoke tests; smoke accepts an honest `false`, while the separate submission gate requires the live proof and ignored raw proof is never traced into the runtime bundle |
| live-creator-review-finalization | A creator can privately inspect the registered live prose, accept/reject it, or edit display wording without changing canonical semantics; only approved deterministic results become public evidence | verified | private-path, Markdown-escape, write-once pair, decision-binding, reject-unchanged, four-control replay, two-transition hash-chain, rollback, and public-schema privacy tests; no real live result exists yet |
| hard-validation | Named world and character-knowledge violations fail closed | fixture-only | five-case frozen replay and dedicated validator tests |
| registered-two-intent-attribution | The frozen rehearsal contains two registered intents, gives each character a playable line, and preserves participant-to-character lineage plus one enforceable authorization source | fixture-only | reciprocal authorizing/contributing fixture lineage, duplicate-control, unknown-lineage, unauthorized-speaker/action tests, and browser coverage |
| arbitrary-intent-composition | Arbitrary facilitator-collected intents produce a matching structured candidate | blocked | a sanitized real GPT-5.6 run through the gated live adapter; the frozen fixture does not branch on prompt prose |
| creator-style-profile | An original creator-owned style profile is passed beside character evidence and referenced by the structured draft, with objective and human-reviewed checks visibly separated | fixture-only | stable constraint IDs, bounded live-input mock, validator tests, style receipt, browser evidence, and style-harness artifact |
| style-ablation-protocol | A same-model comparison changes only the creator style bundle and cannot silently retry, replace, or overwrite calls | verified | preregistered AB/BA plan, strict contracts, focused style-evaluation suite, plan/capture/ratings hashes, and write-once report path |
| style-controllability-ablation | Whether the selected style profile changes registered controllability measures in the intended direction on the fixed GPT-5.6 probe | blocked | four live calls, both profiled objective passes, positive creator-rubric delta in both AB/BA pairs, and no registered human-criterion regression |
| canon-knowledge-graph | A deterministic canon/knowledge graph shows used evidence, missing character knowledge, conflicts, proposals, approvals, and state | fixture-only | byte-stable graph tests, evidence artifact, browser view, and text fallback |
| bounded-state-transition | Two simulation steps change only registered state variables and server-rederived creator-approved overlay data, with deterministic snapshot hashes | fixture-only | transition invariants, exact hash chain, forged-overlay rejection, API/browser flow, and blocked third step |
| creator-gate | Proposal cannot change canon before valid approval | verified | version/hash decision tests and unchanged reject/stale paths |
| semantic-edit-lock | Creator edit may change rule display wording but cannot retarget, alter, or conceal rule/claim semantics | verified | semantic rule-description and claim-summary mutation tests, strict proposal contract, server-replayed decision path, and graph/browser audit-surface checks |
| replay-regression | The baseline five-case/eight-stage suite passes, and every applied or edited overlay reruns four run-only safety controls against its exact hash before transition | fixture-only | proposal → decision/rebase → approved-overlay replay → Step 1 → Step 2 report |
| evidence-packet | Sanitized public evidence is generated from executable fixtures | verified | seven JSON artifacts plus SHA-256 manifest and privacy scan |
| fresh-copy-rehearsal | A clean public candidate copy installs and passes the release gate | verified mechanism; per-commit result externalized | every release candidate must pass post-commit `npm ci`, zero-vulnerability audit, exact source identity, full Vitest/privacy/build/browser gate, and deployment smoke; the current SHA and result exist only in ignored `private-submission/release-record.json` |
| deployment-smoke-local | The production smoke rejects stale build identity and verifies the exact two-step authority chain | verified mechanism; per-commit result externalized | cache-busted exact-SHA identity, configured security headers, typed health signal, overlay/snapshot hashes, S0r→S1→S2 transition records, and public-live denial are rerun after each release commit; hosted-origin proof remains separate |
| submission-readiness-gate | Final release requirements are evaluated together without echoing private IDs or URLs | verified | strict ignored-record path/schema, pure fail-closed evaluator, redacted report, exact-SHA plus canonical child-manifest verification, semantically bound live evidence, exact GitHub Actions workflow run, allowlisted hosted smoke, structured name/final-description parity, UUID feedback receipt, tracked style-claim contract, video metadata/content receipt, and human-attested Devpost field parity after an authenticated owner view or plugin-assisted check |
| submission-ready | Every required Build Week field and public artifact is verified against the final commit | blocked | `npm run submission:check` must pass; **Penelope Ontology** is name-locked, while live GPT-5.6, final description, README, remote/CI, hosted demo, narrated video, private feedback ID, and confirmed track remain; local exact-SHA status is read from the ignored release record rather than asserted here |
| source-locators | Four mythology locators resolve and support the original summaries | verified | Perseus link checks and `docs/SOURCE-VERIFICATION.md` |
| myth-atlas-private-candidates | Ten producer-reported exact-passage claim candidates are available as private reference material | source-backed, private quarantine accepted | the initial free-form manifest failed Penelope's enum/role schema; corrected packaging revision `v1.0.1` with manifest `schemaVersion: "1.0.0"` passed schema and byte-integrity intake for 16 assets / 2,489,820 bytes and returned `quarantined_private_reference`, with five `video_reported` items, six pending items, all six intake warnings, and every public/canon gate still blocked |
| myth-atlas-private-compatibility | A quarantined external pack can be compared with the registered World Pack without importing prose or granting runtime authority | verified analysis-only | the real corrected handoff produced a path-free `analysis_only_no_import` report binding intake receipt `5b5f390a…` to registered World Pack `8e73033c…`; all four eligibility surfaces are false / zero and the report enumerates seven required mappings plus six governance/review gates |
| public-readme | README derives from the Evidence Packet through the approved writing gate | blocked | the approved writing pipeline reports `SERVING_STALE`; refresh its authority hashes before generation |
| reviewer-demo-hosted | A judge can use the working demo without rebuilding | planned | public deployment URL and browser smoke |
| public-repository | Reproducible source repository is available | planned | public remote, license, CI, and fresh-clone proof |
| demo-video-public | Public narrated demo is under three minutes | planned | YouTube URL and duration check |
| codex-feedback-recorded | Core Codex task `/feedback` ID is stored privately | planned | Devpost field and gitignored private record; never public Git |
| quest-consistency-linter | Quest preconditions, outcomes, NPC state/knowledge, and canon dependencies are checked with representative fixtures | target | `QuestSpec` contract, seeded-fault tests, and practitioner task evidence |
| quest-generation | The product creates useful quest candidates | target | generator implementation, validity evaluation, human revision data, and attribution boundaries |
| user-productivity | Product improves creator productivity | prohibited now | measured user study, not self-report |
| world-consistency-guaranteed | Product prevents world collapse | prohibited | impossible to establish from MVP evidence |
| hackathon-submitted | Devpost submission completed | planned | human-attested fields copied after an authenticated owner view or plugin-assisted check, plus public project reachability; a public URL alone is insufficient |

## Public claim rules

Allowed after corresponding evidence exists:

- implemented provenance-aware retrieval and deterministic world checks
- isolated new lore behind creator approval and versioned replay
- separated editable display wording from locked rule and claim semantics
- used GPT-5.6 Structured Outputs in a real narrative-generation path
- requested `gpt-5.6-sol` through the ChatGPT-authenticated Codex CLI only after a real sanitized CLI capture exists; keep `actualModel` and `responseId` unknown and do not present it as Responses API evidence
- generated two consecutive scenes through the Story Workbench's ChatGPT-authenticated Codex CLI lane, explicitly labeled as **requesting** `gpt-5.6-sol`; keep the serving model unverified and the creator's prose verdict pending
- replayed a fixed contract set before and after a creator-approved overlay
- replayed a registered frozen two-intent fixture with explicit participant, controlled-character, authorizing/contributing-intent, and generated-speaker attribution
- combined arbitrary facilitator-collected participant intents only after a sanitized live run proves that path; the current fixture is not that proof
- carried an original creator-owned style profile as a registered harness input referenced through stable IDs; one deterministic bound is checked while six constraints remain creator-reviewed
- displayed a derived canon/knowledge graph from typed JSON
- applied two deterministic state transitions after model output passed hard validation and creator approval

Do not claim:

- guaranteed coherence or creativity
- production readiness
- user adoption, satisfaction, or time savings without measurements
- training or fine-tuning
- graph ontology if the product uses typed JSON and derived relations
- a graph database or actual remote multi-user room
- superior writing quality versus Fable, Opus, or another model without controlled same-brief human evaluation
- imitation of a living author's style or use of private author-voice data
- generalized quest automation or quest generation before the target evidence exists
- long-running autonomous simulation or persistent agent memory
- an “independent AI validator”; the MVP hard gate is deterministic code, not a second model call
- a baseline performance improvement; the MVP has no powered paired baseline and makes only contract-replay claims
- that a Codex CLI requested-model flag proves the actual serving model or a Responses API response identity
- Myth Atlas private-quarantine material as public sources, accepted canon, or an imported World Pack; the corrected machine handoff proves only producer attestation plus byte integrity, and Penelope creator review has not occurred

## Privacy evidence

The public repository must contain no API keys, personal absolute paths, raw conversations, private story IP, private knowledge-base files, private employment materials, or `/feedback` session IDs. A path and secret scan becomes mandatory before the first push.
