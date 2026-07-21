# RETURN — World Codex and causal UI

Status: **IMPLEMENTED / VERIFIED / NOT_PUSHED / NOT_DEPLOYED**

## Outcome

Penelope now exposes the current world as an inspectable creator surface instead
of scattering the same evidence across prose, NPC cards, and a hidden inspector.

- **The Loom** appears only when a prepared A/B or creator-confirmed C actually
  enters resolution. It does not appear during the C interview, so asking for
  tacit knowledge cannot be mistaken for a state change.
- **World Aftermath** keeps the existing causal receipt chain but presents it as
  the result of the accepted choice.
- **World Codex** separates Overview, Cast, Relations, Plot, and Branches. It
  shows current motives, positions, knowledge counts, parent-checkpoint changes,
  declared relationships, current receipt events, pressure clocks, ending
  horizons, latent creator-only risks, and checkpoint lineage.
- Desktop and narrow layouts prioritize readable text. Relations use a legible
  `subject → declared relation → object` map; under 920 px the map and detail
  panel stack, and at 390 px relation rows become one-column records.

## Authority boundary

World Codex does not summarize or infer from narration.

- Relationship edges are optional, typed World Pack data with actor-reference,
  self-edge, duplicate-ID, and duplicate-typed-edge validation.
- The World Pack digest binds declared World Codex data.
- Scenario summary, relationship edges, and possible endings enter only the
  creator receipt. The participant projection remains unchanged.
- Cast changes, clocks, risks, events, and branches are derived from creator
  receipts and checkpoints.
- A pack without relationship edges receives an honest empty state. Existing
  creator packs remain valid; no graph database or embedding dependency was
  added.

## Changed files

- Contracts and projection:
  - `src/contracts/penelope-world-pack.ts`
  - `src/contracts/world-api.ts`
  - `src/application/world-simulation-service.ts`
  - `src/adapters/world-packs/odyssey-book19.ts`
  - `components/world/world-codex.ts`
- UI:
  - `components/world/WorldCodex.tsx`
  - `components/world/WorldCodex.module.css`
  - `components/world/CausalTransition.tsx`
  - `components/world/CausalTransition.module.css`
  - `components/world/WorldWorkbench.tsx`
  - `components/world/WorldWorkbench.module.css`
- Tests:
  - `tests/unit/world-codex.test.ts`
  - `tests/unit/penelope-world-pack.test.ts`
  - `tests/unit/world-simulation-service.test.ts`
  - `tests/unit/world-delta.test.ts`
  - `tests/browser/world-flow.spec.ts`
- Truth sync:
  - `docs/START-HERE.md`
  - `docs/JUDGE-GUIDE.md`
  - `docs/BUILD-WEEK-COMMAND-CENTER.md`
  - `docs/submission/DEVPOST-DRAFT.md`

## Verification

- Contract/projection TDD RED reproduced before implementation:
  - unknown `worldCodex` rejected;
  - creator receipt had no World Codex projection.
- Focused contract/service/projection: **3 files / 19 tests PASS**.
- Full `npm run verify`: **PASS**.
  - evidence generation/verification: **7 files PASS**;
  - ESLint: **PASS**;
  - TypeScript: **PASS**;
  - Vitest: **108 files / 892 tests PASS**;
  - privacy scan: **434 files PASS**;
  - production build: **PASS**;
  - Next trace privacy: **21 manifests / 2,742 files PASS**.
- Development browser regression: **44/44 PASS** across Chromium desktop and
  mobile WebKit.
- Production browser regression with two workers: **44/44 PASS**.
- Final privacy rescan after adding this RETURN and truth-sync documents:
  **435 files PASS**.
- The first four-worker production run had one transient failure in the
  pre-existing Table reject test. That test immediately passed **2/2** in
  isolation; the reduced-parallelism full run then passed **44/44**.
- New World Codex browser acceptance explicitly checks desktop and 390 px
  mobile horizontal overflow, creator-only authority copy, plot events,
  branches, The Loom, and World Aftermath.

## Honest limits

1. Relationship edges are declared pack authority, not dynamically rewritten
   relationship scores. A future relationship change needs its own typed event
   and receipt delta; this UI does not fake one from prose.
2. World Forge does not yet ask a dedicated relationship-authoring question.
   Forged packs still receive Overview, Cast, Plot, and Branches, while
   Relations remains honestly empty unless the definition supplies edges.
3. World Codex is a derived typed projection, not a graph database, RDF/OWL
   ontology, persistent creator library, or account-backed collaboration room.
4. No image asset, presentation video, demo video, push, deployment, or Vault
   authority write was performed.

## Next action

Commit this exact scope, recertify the new SHA, then use the candidate build for
the creator-approved presentation/demo capture and hosted release gate.
