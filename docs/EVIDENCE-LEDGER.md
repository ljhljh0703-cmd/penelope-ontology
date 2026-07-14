# Evidence ledger

Evidence states: `verified`, `source-backed`, `fixture-only`, `planned`, `target`, `blocked`, `prohibited`.

| ID | Claim | State | Required proof |
|---|---|---|---|
| build-week-registered | Eligible participant registration matches the project identity | verified | authenticated registration check with private identity fields redacted |
| devpost-project-published | Honest in-progress Devpost project page is public | verified | public project read-back; project state `published` |
| credit-request-resubmitted | Codex credit request was resubmitted with exact track and matching identity | verified | form confirmation and response receipt; approval remains pending |
| scaffold-created | Local Next.js/TypeScript scaffold exists | verified | repository files and local Git status |
| world-pack-contract | Demo World Pack satisfies referential schema | verified | seven schema and malformed-reference tests passed |
| structured-draft-contract | Model draft and strict JSON Schema agree | verified | four model-contract tests passed |
| fixture-boundary | Fixture and live response identities cannot cross | verified | three discriminated trace tests passed |
| replay-fixture-contract | World Pack and replay file have exact, valid ID parity | verified | three replay schema/reference tests passed |
| app-builds | Production application builds | verified | `npm run verify` and Next production build exit 0 |
| approved-table-surface | The browser implements the approved multi-intent, style, graph, creator-gate, and two-step flow | planned | end-to-end browser assertions and reviewed capture; current Day-0 shell is stale |
| dependency-audit | Installed dependency graph has no reported npm vulnerabilities | verified | `npm audit --json`, 2026-07-15, total 0 |
| core-contracts-locked | The eight demo-critical contract groups are represented and tested | planned | contract failure tests and schema parity checks for speaker/rule/outcome/overlay/replay/intent/graph/simulation |
| retrieval-deterministic | Retrieval order is byte-stable | planned | repeated-input test |
| gpt56-integrated | Real GPT-5.6 Responses call works | planned | sanitized real response metadata and parsed draft |
| hard-validation | Named world and character-knowledge violations fail closed | planned | frozen replay results |
| multi-intent-attribution | A facilitator can combine multiple participant intents while every utterance and action retains participant-to-character lineage and one enforceable authorization source | planned | duplicate-control, unknown-lineage, unauthorized-speaker/action, and authorizing/contributing intent tests plus browser trace |
| creator-style-profile | An original creator-owned style profile is passed beside character evidence and referenced by the structured draft | planned | stable constraint-ID contract, prompt-input trace, unknown/cross-profile ID tests, objective constraint tests, and browser evidence |
| style-controllability-ablation | The selected style profile changes observable output characteristics for the same model and evidence bundle | target | paired same-model runs, objective checks, and a labeled human rubric |
| canon-knowledge-graph | A deterministic canon/knowledge graph shows used evidence, hidden character knowledge, conflicts, proposals, and approval state | planned | byte-stable graph descriptor test and browser screenshot |
| bounded-state-transition | Two simulation steps change only registered state variables and approved overlay data, with deterministic snapshot hashes | planned | transition invariant tests and two-step replay report |
| creator-gate | Proposal cannot change canon before valid approval | planned | canon hash/version tests |
| replay-regression | Unchanged controls preserve their outcomes while the red-sail target matches explicit v0/v1 expectations | planned | proposal → decision/rebase → Step 1 → Step 2 replay report plus control-case comparison |
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
- used GPT-5.6 Structured Outputs in a real narrative-generation path
- replayed a fixed contract set before and after a creator-approved overlay
- combined facilitator-collected participant intents with explicit participant, controlled-character, and generated-speaker attribution
- applied an original creator-owned style profile as a separate harness layer; objective and subjective checks remain labeled separately
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
