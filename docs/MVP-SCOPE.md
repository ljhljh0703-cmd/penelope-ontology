# MVP scope and eight-day plan

The schedule is organized around one vertical slice, not feature count.

| Day | Deliverable | Done gate |
|---|---|---|
| 0 | Repository contract, schemas, fixture provider, app shell, CI | clean install; contract tests and build pass |
| 1 | Validated two-state World Pack and six frozen cases | no dangling IDs; source and rights risks named |
| 2 | Deterministic retrieval and evidence bundle | repeated input returns byte-identical ordered IDs |
| 3 | GPT-5.6 Responses adapter | real request produces strict draft; refusal/error paths tested |
| 4 | Hard validators and diagnostic UI | dead Hector and knowledge leak fail closed |
| 5 | Creator accept/edit/reject, versioned overlay, replay | approval changes version; reject/stale decision cannot |
| 6 | One-page end-to-end UX and soft review | creator completes four demo cases without editing JSON |
| 7 | Baseline comparison, privacy scan, fresh-clone rehearsal | ten or more frozen runs; claims match evidence |
| 8 | Freeze, public README, demo video, Devpost package, `/feedback` ID | under-three-minute public video and reproducible repo |

## Expansion freeze

Do not start graph DB, embeddings, login, collaboration, generic editing, TRPG aggregation, simulation, memory, or multi-agent work unless the full vertical slice passes first.

## Revisit triggers

- embeddings: deterministic retrieval misses required claims on a representative multi-pack set
- graph DB: JSON traversal becomes a measured bottleneck or authoring integrity cannot be maintained
- server database: multiple creators need shared canon and authorization
- generic editor: users can complete the demo but cannot create a pack without engineering help
- TRPG aggregation: at least one real GM validates the single-creator core and requests group intent capture
