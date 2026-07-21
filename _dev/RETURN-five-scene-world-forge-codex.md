# RETURN — Five-scene World Forge and cumulative World Codex

Status: **IMPLEMENTED / FULL_LOCAL_GATE_PASS / NOT_COMMITTED / NOT_PUSHED / NOT_DEPLOYED**

## Outcome

The approved product upgrades are implemented as one causal path rather than three disconnected UI demonstrations.

1. **The Loom tells the truth.** Resolving, creator review, accepted, and failed choices use different headings. A failed request explicitly says the prior checkpoint is intact. The overlay remains until dismissal, scrolls on a 320×480 viewport, exposes one live status region, and keeps its close control keyboard-visible.
2. **World Forge creates a five-scene episode.** The intake now requires 24 creator-approved facts, including a relationship axis and four later-scene beats. The compiler emits the fixed `setup → pressure → turn → reckoning → resolution` spine, a bounded `-2…2` relationship, repeating A/B causal rules, and endings that require both a chosen route and turn five.
3. **The runtime carries the episode.** Accepted actions advance exactly one scene, update the relationship, preserve the transition in the turn receipt, and replay the same transition deterministically. The current dramatic phase enters fixture prose; full approved purpose, pressure, and completion remain inspectable in World Codex.
4. **World Codex accumulates the world.** Plot shows the approved spine and realized beats. Relations show current level, creator-readable label, last delta, and receipt-backed history. Endings expose satisfied and unsatisfied conditions. Branches draw actual parent-child checkpoint edges and retain an accessible checkpoint list.
5. **World Pulse and Fork Compare include relationships.** Loom consequences, aftermath summaries, and line comparisons no longer omit a typed relationship change.

## Material defect found and fixed

The first production-browser rehearsal exposed a real integration defect: after an A action resolved, the narration validator still treated that same A as an unperformed reserved action. `AC-ACT-01` therefore blocked the scene even though the deterministic runtime had accepted it. The narration build now excludes only the action currently being rendered from that turn's reserved candidates. The alternate route remains reserved, and the executed action becomes available again on the next scene.

## Changed surfaces

- Contracts and runtime: `src/contracts/world-simulation.ts`, `src/contracts/world-runtime.ts`, `src/contracts/world-api.ts`, `src/contracts/world-forge.ts`, `src/contracts/penelope-world-pack.ts`, `src/domain/world-runtime.ts`
- Application projection and compilation: `src/application/world-forge-service.ts`, `src/application/world-simulation-service.ts`
- Product UI: `components/world/CausalTransition.tsx`, `components/world/CausalTransition.module.css`, `components/world/WorldForge.tsx`, `components/world/WorldWorkbench.tsx`, `components/world/world-delta.ts`, `components/world/world-codex.ts`, `components/world/WorldCodex.tsx`, `components/world/WorldCodex.module.css`
- Tests and fixture: `tests/fixtures/world-forge-approved.json`, `tests/unit/world-forge.test.ts`, `tests/unit/world-forge-api.test.ts`, `tests/unit/world-delta.test.ts`, `tests/unit/world-codex.test.ts`, `tests/browser/world-forge.spec.ts`, `tests/browser/world-flow.spec.ts`
- Truth sync: `README.md`, `docs/START-HERE.md`, `docs/JUDGE-GUIDE.md`, `docs/BUILD-WEEK-COMMAND-CENTER.md`, `docs/submission/DEVPOST-DRAFT.md`

## Verification

- Focused contracts/runtime/projection: **5 files / 19 tests PASS** before browser work.
- Full local `npm run verify`: **PASS**.
  - evidence generation and verification: **7 files PASS**;
  - ESLint and TypeScript: **PASS**;
  - Vitest: **108 files / 893 tests PASS**;
  - privacy scan before this RETURN: **435 files PASS**;
  - production build: **PASS**;
  - Next trace privacy: **21 manifests / 2,744 files PASS**.
- Production browser regression: **46/46 PASS** across desktop Chromium and mobile WebKit.
- The five-scene Forge flow passes in both projects from 24 approvals through turn five, relationship history, final Fate Frame, and World Codex plot inspection.
- Final privacy rescan including this RETURN and truth sync: **436 files PASS**.
- `git diff --check`: **PASS**.

## Honest limits

- The creator-owned episode and checkpoints remain session-scoped; this is not an account library or collaborative cloud workspace.
- World Forge authors two strategic routes and five approved scene beats, not ten independently authored per-scene actions. The same route can be reaffirmed or changed as pressure accumulates.
- Fixture prose names the active dramatic phase and proves causal continuity. It is not a human literary-quality verdict and does not recite the entire creator-authored beat. World Codex preserves that complete beat as the inspectable source of truth.
- The relationship model is a bounded typed axis, not a graph database or autonomous long-running social simulation.
- No presentation video, demo video, commit, push, deployment, hosted smoke, or Devpost submission was performed.

## Release gate

Implementation is locally complete. The next release action is to commit this exact scope, recertify the resulting SHA in a clean tree, then run CI, deployment, hosted smoke, and the separately creator-approved video process.
