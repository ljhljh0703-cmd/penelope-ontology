# Evidence ledger

Evidence states: `verified`, `source-backed`, `fixture-only`, `historical`, `planned`, `target`, `blocked`, `prohibited`.

| ID | Claim | State | Required proof |
|---|---|---|---|
| build-week-registered | Eligible participant registration matches the project identity | verified | authenticated registration check with private identity fields redacted |
| devpost-project-published | Honest in-progress Devpost project page is public | verified | public project read-back; project state `published` |
| credit-request-resubmitted | Codex credit request was resubmitted with exact track and matching identity | verified | form confirmation and response receipt; approval remains pending |
| scaffold-created | Local Next.js/TypeScript scaffold exists | verified | repository files and local Git status |
| world-pack-contract | Demo World Pack satisfies referential schema | verified | `tests/unit/world-pack-schema.test.ts` plus filesystem and Phase-0 contract checks |
| structured-draft-contract | Model draft and strict JSON Schema agree | verified | `tests/unit/model-draft-contract.test.ts` |
| fixture-boundary | Fixture and live response identities cannot cross | verified | `tests/unit/fixture-trace.test.ts` |
| public-fixture-authority | Public run, decision, and transition routes accept only the exact registered red-sail replay request and reject fixture relabeling | verified | canonical equality against the replay stage plus mutations of brief, intent, draft, style, task, overlay, and snapshot at all three route boundaries |
| replay-fixture-contract | World Pack and replay file have exact, valid ID parity | verified | `tests/unit/replay-case-contract.test.ts` |
| app-builds | Production application builds | verified | `npm run verify` and Next production build exit 0 |
| approved-table-surface | The browser implements a registered frozen two-intent rehearsal with visible lineage, style receipt, knowledge boundary, graph, creator gate, production review packet, and two-step flow | verified | 10 production Playwright checks across desktop and iPhone/WebKit plus fresh candidate/completion visual inspection |
| dependency-audit | Installed dependency graph has no reported npm vulnerabilities | verified | `npm audit --json`, 2026-07-15, total 0 |
| core-contracts-locked | The eight demo-critical contract groups are represented and tested | verified | contract and malformed-input suite plus schema/hash fixture audit |
| retrieval-deterministic | Retrieval order and character views are stable for fixed inputs | verified | repeat-input and character-scope tests |
| gpt56-adapter | GPT-5.6 Responses adapter uses strict Structured Outputs and typed failure paths | verified | injected-client tests; no network call |
| gpt56-integrated | Real GPT-5.6 Responses call works | blocked | no API key or sanitized live response metadata yet |
| live-capture-transaction | A dispatched live attempt cannot silently overwrite a canonical pair or disappear without a durable prose-free receipt or recovery sentinel | verified | configuration/output preflight, exclusive lock, pre-dispatch sentinel, append-only ignored receipts, receipt-failure recovery tests for completed and typed outcomes, atomic no-clobber publication, target-race preservation, partial-pair rollback, explicit retry, and public receipt-binding gate |
| health-readiness-binding | `/api/health` reports live evidence only when the generated readiness artifact has the full verified authority, completed-capture receipt, and privacy shape | verified | strict evidence type/model/hash/path/authority/receipt/privacy guard plus malformed-artifact tests |
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
| fresh-copy-rehearsal | A clean public candidate copy installs and passes the release gate | verified | current post-commit clean clone: `npm ci`, zero audit vulnerabilities, exact source identity, 30/156 Vitest, privacy, production build, and 10 browser checks; authority recorded in ignored `private-submission/release-record.json` |
| deployment-smoke-local | The production smoke rejects stale build identity and verifies the exact two-step authority chain | verified | current repository and clean clone both pass cache-busted exact-SHA identity, configured security headers, overlay/snapshot hashes, S0r→S1→S2 transition records, and public-live denial; hosted origin remains separate |
| source-locators | Four mythology locators resolve and support the original summaries | verified | Perseus link checks and `docs/SOURCE-VERIFICATION.md` |
| public-readme | README derives from the Evidence Packet through the approved writing gate | blocked | package write/derive preflights are `SERVING_CANDIDATE`; explicit user approval and `--allow-candidate` rerun are required |
| reviewer-demo-hosted | A judge can use the working demo without rebuilding | planned | public deployment URL and browser smoke |
| public-repository | Reproducible source repository is available | planned | public remote, license, CI, and fresh-clone proof |
| demo-video-public | Public narrated demo is under three minutes | planned | YouTube URL and duration check |
| codex-feedback-recorded | Core Codex task `/feedback` ID is stored privately | planned | Devpost field and gitignored private record; never public Git |
| quest-consistency-linter | Quest preconditions, outcomes, NPC state/knowledge, and canon dependencies are checked with representative fixtures | target | `QuestSpec` contract, seeded-fault tests, and practitioner task evidence |
| quest-generation | The product creates useful quest candidates | target | generator implementation, validity evaluation, human revision data, and attribution boundaries |
| user-productivity | Product improves creator productivity | prohibited now | measured user study, not self-report |
| world-consistency-guaranteed | Product prevents world collapse | prohibited | impossible to establish from MVP evidence |
| hackathon-submitted | Devpost submission completed | planned | submission confirmation |

## Public claim rules

Allowed after corresponding evidence exists:

- implemented provenance-aware retrieval and deterministic world checks
- isolated new lore behind creator approval and versioned replay
- separated editable display wording from locked rule and claim semantics
- used GPT-5.6 Structured Outputs in a real narrative-generation path
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

## Privacy evidence

The public repository must contain no API keys, personal absolute paths, raw conversations, private story IP, private knowledge-base files, private employment materials, or `/feedback` session IDs. A path and secret scan becomes mandatory before the first push.
