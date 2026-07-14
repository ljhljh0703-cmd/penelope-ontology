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
7. Fixture and live requests are discriminated. Fixture mode requires a structured fixture ID; live mode forbids it and remains disabled unless both a server-side API key and explicit enable flag exist.
8. The UI will use a finite workbench state machine and stateless API calls. React will not duplicate canon or transition rules.
9. Alias validation uses Unicode-aware registered-name boundaries. The regression suite caught and fixed the false match `Ithaca` inside `Ithacan`; fixture data was not weakened to hide the defect.
10. Public evidence is generated from the executable fixture flow. It records graph, proposal, decision/rebase, two transitions, a blocked third step, replay, and style-harness boundaries without presenting fixture output as a live model call.
11. The live adapter sends only participant intents, the selected original style profile, and character-scoped views/context. It omits the complete overlay, snapshot, facilitator graph, and top-level true-state evidence IDs from the model input.

### Verified implementation state

- Phase 0 contract suite: 26 tests passed at handoff.
- Integrated unit and API suite: 71 tests passed before the browser surface handoff; the final count is recorded by the release gate rather than frozen here.
- Final local release gate: 77 unit/API tests and 6 Playwright checks passed across desktop Chromium and iPhone/WebKit.
- Frozen replay: five cases and eight stages, including proposal → creator decision/rebase → Step 1 → Step 2.
- Deterministic chain: `idle → watching → signal_seen`; a third step is blocked with the state hash unchanged.
- Public evidence generator: six sanitized artifacts plus a SHA-256 manifest.
- Privacy scan passed after evidence generation.

### Improvement queue after required gates

- Add a Quest Consistency Linter only after vertical slice, live trace, browser smoke, privacy scan, Evidence Packet, and release rehearsal all pass with the required buffer.
- Run a same-model unbounded/profiled style ablation with objective checks and a separately labeled human rubric; do not make model-vendor superiority claims.
- Consider graph DB or embeddings only after a representative multi-pack retrieval evaluation shows a measured need.

### External or discussion items

- `OPENAI_API_KEY` is currently absent from the process environment. Live GPT-5.6 evidence cannot be produced until a key is supplied locally; implementation and fixture verification continue meanwhile.
- Browser smoke is complete: all 6 Table-flow checks pass across desktop Chromium and iPhone/WebKit.
- `package-project-evidence` audit mode is certified, but README write-mode preflight returned `SERVING_STALE` because the readme-standard delegate, checklist, and template hashes changed. Do not create README.md until Vault Claude refreshes the manifest and write-mode preflight passes.
- Final product name remains intentionally unlocked. The technical label stays `Narrative Knowledge Harness` until the user names it.
