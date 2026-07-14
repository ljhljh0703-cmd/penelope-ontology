# Evidence ledger

Evidence states: `verified`, `source-backed`, `fixture-only`, `planned`, `blocked`, `prohibited`.

| ID | Claim | State | Required proof |
|---|---|---|---|
| scaffold-created | Local Next.js/TypeScript scaffold exists | verified | repository files and local Git status |
| world-pack-contract | Demo World Pack satisfies referential schema | verified | seven schema and malformed-reference tests passed |
| structured-draft-contract | Model draft and strict JSON Schema agree | verified | four model-contract tests passed |
| fixture-boundary | Fixture and live response identities cannot cross | verified | three discriminated trace tests passed |
| replay-fixture-contract | World Pack and replay file have exact, valid ID parity | verified | three replay schema/reference tests passed |
| app-builds | Production application builds | verified | `npm run verify` and Next production build exit 0 |
| retrieval-deterministic | Retrieval order is byte-stable | planned | repeated-input test |
| gpt56-integrated | Real GPT-5.6 Responses call works | planned | sanitized real response metadata and parsed draft |
| hard-validation | Named ontology violations fail closed | planned | frozen replay results |
| creator-gate | Proposal cannot change canon before valid approval | planned | canon hash/version tests |
| replay-regression | Canon update preserves prior expected cases | planned | replay report before and after update |
| user-productivity | Product improves creator productivity | prohibited now | measured user study, not self-report |
| world-consistency-guaranteed | Product prevents world collapse | prohibited | impossible to establish from MVP evidence |
| hackathon-submitted | Devpost submission completed | planned | submission confirmation |

## Public claim rules

Allowed after corresponding evidence exists:

- implemented provenance-aware retrieval and deterministic world checks
- isolated new lore behind creator approval and versioned replay
- used GPT-5.6 Structured Outputs in a real narrative-generation path
- compared a baseline and harness on a fixed replay set

Do not claim:

- guaranteed coherence or creativity
- production readiness
- user adoption, satisfaction, or time savings without measurements
- training or fine-tuning
- graph ontology if the product uses typed JSON and derived relations
- an “independent AI validator” when soft review uses the same model family

## Privacy evidence

The public repository must contain no API keys, personal absolute paths, raw conversations, private story IP, private knowledge-base files, private employment materials, or `/feedback` session IDs. A path and secret scan becomes mandatory before the first push.
