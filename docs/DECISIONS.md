# Decision log

| ID | Decision | Reason | Revisit trigger |
|---|---|---|---|
| D-001 | Submit under Work & Productivity | The primary value is reducing continuity-checking work for creators | Product becomes a consumer storytelling app rather than an authoring tool |
| D-002 | Closed-world by default | Unsupported facts must not pass as canon | A creator explicitly selects an exploratory sandbox mode with separate evidence |
| D-003 | Typed JSON World Pack for MVP | Small fixture needs validation and versioning, not database operations | Multi-pack scale creates a measured query or authoring problem |
| D-004 | Deterministic lexical and graph-neighbor retrieval | Stable replay matters more than semantic breadth in the tiny pack | Representative recall eval shows material misses |
| D-005 | GPT-5.6 Responses Structured Outputs | Machine-checkable assertions are required after prose generation | Official API guidance or measured reliability changes |
| D-006 | No model tool calling | The model has one bounded generation operation | A future bounded tool workflow outperforms direct generation on evals |
| D-007 | Creator-gated additive overlay | Suggestions and approved canon must remain separate | Never; this is a product invariant |
| D-008 | Two fixed mythology states | The demo needs visible boundaries, not encyclopedic breadth | Core slice passes and a new state has a tested narrative job |
| D-009 | Fixture and live evidence are separate | Reviewers must know what actually used GPT-5.6 | Never; this is an evidence invariant |
| D-010 | No final brand name during scaffold | Naming is a user decision and the product is still changing | User names the product |

## Rejected now

- Graph DB and embeddings: too much infrastructure for a tiny deterministic pack.
- Full Greek mythology: creates source, conflict, and ontology breadth without proving the control loop.
- Multi-user TRPG aggregation: valuable application, but it hides the core canon gate behind collaboration work.
- Private first-party story pack: stronger personal relevance, unacceptable public IP and privacy exposure.
- “Independent AI validator” claim: a second GPT-5.6 call is not independent evidence. Hard validation must be deterministic.
