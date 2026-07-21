# RETURN — Story WOW vertical slice

Date: 2026-07-16
Branch: `codex/story-wow-vertical-slice`
Gate: **code and integration PASS; creator prose decision pending**

## Product result

Penelope Ontology now leads with a bounded story-continuation workbench. The user enters a registered choice or a bounded direct action; the runtime resolves it into typed consequences, scopes world knowledge to the scene, applies creator-owned prose constraints, and commits the next scene only after causal, action-ownership, grounding, and closure checks pass.

Dice, items, conditions, and GM rulings remain optional resolution authorities. They are not the product hero.

## Implemented

- `/story` three-scene workbench with direct action and folded candidate choices
- two real fixture branches with distinct benefits, costs, and endings
- bounded English Red-Sail intent routing with raw direct text preserved
- typed story spine, character drives, style profile, scene contract, resolution envelope, claim scope, causal ledger, and story-state fingerprint
- fail-forward for unsupported or contradictory actions
- current/performed action and reserved-next-action actor authority
- fail-closed typed next-choice authority plus bounded English semantic guards for every registered Red-Sail reserved action
- server comparison against immutable scenario, drives, style, and spine authority
- ChatGPT-authenticated Codex CLI story transport with explicit enable flag, private-token authorization, loopback defense, and no silent fixture fallback
- one-command full-arc demo: `npm run story:demo -- --transport <fixture|codex_cli> --branch <quiet|bell>`
- actual-route browser completion test with no route interception
- creator-review packet separating automated acceptance from literary acceptance

## Live story evidence

One final quiet-branch run generated Scene 2 and Scene 3 consecutively and completed the session.

- transport: Codex CLI
- requested model: `gpt-5.6-sol`
- actual model: not independently reported
- Scene 2 output SHA-256: `e00dec6e24c3b13f241f3b763f88816eb09ed814569fbacaa73b63aa487eefbf`
- Scene 3 output SHA-256: `4f2ad711ab0199a425efd17e12bba7bee856aa0b2d4f3f62cf617b04966ebf1f`
- manual prose edits: none
- creator verdict: pending in `docs/STORY-LIVE-CREATOR-REVIEW.md`

Earlier outputs were rejected or superseded for actor transfer, hidden-name prompt leakage, an incomplete reserved-action backstop, and a causally ambiguous clue. Those failures became regression gates and a more explicit scene contract rather than being hidden. The exact history is in `docs/STORY-LIVE-CREATOR-REVIEW.md`.

## Verification

- `npm run verify`: PASS
  - evidence generated and verified: 7 files
  - ESLint: PASS
  - TypeScript: PASS
  - Vitest: 70 files, 532 tests PASS
  - privacy scan: PASS, 284 files
  - Next production build: PASS
  - Next trace privacy: PASS, 14 manifests / 2,017 files
- full Playwright: Chromium desktop + WebKit mobile, 22/22 PASS
- Story Playwright subset: 12/12 PASS
- actual Story API subset: 2/2 PASS with no route interception
- `git diff --check`: PASS

The first final verify attempt correctly stopped on privacy-like test placeholders. Those placeholders were changed to scanner-approved test values, privacy was rerun, and the complete verify then passed.

## Remaining gates

1. Creator reads the final unedited arc and records `accept`, `revise`, or `reject`.
2. Root `README.md` remains intentionally absent because the package-project-evidence write adapter is not currently certified for automatic README generation. `docs/START-HERE.md` is the truthful technical entry point.
3. Actual serving-model identity remains unknown; public copy may say only that Codex CLI generated the run while requesting `gpt-5.6-sol`.
4. Final output hashes are recorded run-trace values and are cross-document consistent, but the prose-only review packet cannot independently recompute the deleted temporary structured messages.
5. Public deployment, Devpost video, `/feedback` session ID, and submission are separate release tasks.

## Boundaries

- No API key, raw Codex conversation, personal absolute path, or private story asset was added.
- No push, deployment, or Devpost mutation was performed.
- The private knowledge base remained read-only; no authority or wiki file was changed.
