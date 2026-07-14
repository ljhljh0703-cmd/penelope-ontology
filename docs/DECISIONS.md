# Decision log

| ID | Decision | Reason | Revisit trigger |
|---|---|---|---|
| D-001 | Submit under Work & Productivity for professional GMs, narrative teams, and scenario or quest designers | The primary value is reducing intent-reconciliation, voice-control, continuity, approval, and state-checking work | Product becomes a consumer storytelling app rather than a production tool |
| D-002 | Closed-world by default | Unsupported facts must not pass as canon | A creator explicitly selects an exploratory sandbox mode with separate evidence |
| D-003 | Typed JSON World Pack for MVP | Small fixture needs validation and versioning, not database operations | Multi-pack scale creates a measured query or authoring problem |
| D-004 | Deterministic lexical and graph-neighbor retrieval | Stable replay matters more than semantic breadth in the tiny pack | Representative recall eval shows material misses |
| D-005 | GPT-5.6 Responses Structured Outputs | Machine-checkable assertions are required after prose generation | Official API guidance or measured reliability changes |
| D-006 | No model tool calling | The model has one bounded generation operation | A future bounded tool workflow outperforms direct generation on evals |
| D-007 | Creator-gated additive overlay | Suggestions and approved canon must remain separate | Never; this is a product invariant |
| D-008 | Two fixed mythology states | The demo needs visible boundaries, not encyclopedic breadth | Core slice passes and a new state has a tested narrative job |
| D-009 | Fixture and live evidence are separate | Reviewers must know what actually used GPT-5.6 | Never; this is an evidence invariant |
| D-010 | No final brand name during scaffold | Naming is a user decision and the product is still changing | User names the product |
| D-011 | The model sees a retrieved character view, not hidden world truth | Character knowledge must be enforceable before generation and auditable after it | Never; this is a narrative-safety invariant |
| D-012 | Base pack is immutable; creator canon changes through a hashed overlay | One version authority makes stale decisions and replay testable | A migration design preserves the same invariants |
| D-013 | Public claims derive from one Evidence Packet | README, Devpost, video, and portfolio must not drift beyond code and test evidence | Never; this is an evidence invariant |
| D-014 | Core implementation lives in one clean Codex task | The required `/feedback` session should represent the majority of the actual build without private planning context | Core implementation is complete and the private session ID is recorded |
| D-015 | Public deployment is fixture-only; live GPT-5.6 runs are local/server-gated | An unauthenticated public route must not expose paid API usage | A reviewed auth and rate-limit design exists |
| D-016 | No baseline performance claim in the MVP | Five frozen cases prove contract behavior, not a powered productivity or quality comparison | A preregistered paired evaluation with enough samples is run |
| D-017 | Location validation uses fixed-state presence, not a travel graph | The Hector demo and bounded simulation need a state invariant, not pathfinding infrastructure | A tested quest or movement workflow requires explicit topology |
| D-018 | User-approved attack scope includes local multi-intent composition, a canon/knowledge graph view, and a deterministic two-step state simulation | These three features make the control harness visible as a complete product rather than a validator-only proof | A core gate fails its dated kill condition or the user reopens scope |
| D-019 | Participants, controlled characters, and generated speakers are separate identities | A human participant must not bypass character knowledge checks by being conflated with a fictional entity | Never; this is an authorization and narrative-consistency invariant |
| D-020 | The primary Work & Productivity audience is professional GMs, narrative production teams, and game scenario or quest designers | The same intent, continuity, approval, and state contracts map to production work beyond hobby play | The product becomes a consumer storytelling experience |
| D-021 | Actual remote multiplayer and long-running autonomous simulation are submission No-Go items | Network synchronization and long-horizon memory add large failure surfaces without improving the core three-minute proof enough | Post-submission, with explicit user authorization and a new architecture plan |
| D-022 | Quest automation is a post-core evidence-gated runway, not an implemented MVP claim | It is strategically valuable for the portfolio but currently has no quest schema, generator, evaluation, or user proof | Core and release gates pass, then a bounded Quest Brief adapter is specified and tested |
| D-023 | Call the derived visualization a canon/knowledge graph, not an ontology graph | Typed JSON relations do not yet establish a formal semantic class and relation contract | A documented ontology contract and validation suite exist |
| D-024 | Treat prose style as a creator-owned harness layer, not a model-brand property | The product should compensate for generic default prose by supplying explicit voice, viewpoint, cadence, and avoidance constraints alongside world knowledge | A paired human evaluation shows a simpler approach is equally controllable |
| D-025 | Make no Fable, Opus, or other model-writing superiority claim | The project has no controlled cross-model writing evaluation; its claim is controllability through a harness, not raw-model victory | A preregistered same-brief evaluation with human raters is completed |
| D-026 | Creator edit may change non-authoritative display wording, never semantic rule or claim fields | A creator can improve presentation without using one proposal approval to retarget identity, kind, semantic description, entities, scope, visibility, conflict, or sources | A separately reviewed semantic migration contract exists |
| D-027 | Stateless transition APIs validate an exact authorized state chain, not wall-clock session occurrence | The fixture demo has no accounts, room state, or database; UI sequencing and snapshot authority are evidence, while per-session occurrence would require signed receipts or persistence | Remote rooms or persistent sessions enter scope |

## Rejected now

- Graph DB and embeddings: too much infrastructure for a tiny deterministic pack.
- Full Greek mythology: creates source, conflict, and ontology breadth without proving the control loop.
- Actual remote multi-user rooms: valuable application, but synchronization, reconnect, authorization, and multi-browser testing hide the core canon gate behind collaboration infrastructure.
- Graph DB-backed authoring: the MVP graph view is derived deterministically from typed JSON and does not need a database.
- Long-running autonomous simulation: the submission implements two deterministic steps, not persistent autonomous agents or memory.
- Private first-party story pack: stronger personal relevance, unacceptable public IP and privacy exposure.
- “Independent AI validator” claim: a second GPT-5.6 call is not independent evidence. Hard validation must be deterministic.
