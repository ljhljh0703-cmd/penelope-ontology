# DISPATCH — Lane D2 runtime migration

Status: `IMPLEMENTED_VERIFIED / EXACT_SCOPE_COMMIT_PENDING`
Checkpoint: `e7ca346c45d1f6982ede21a9816b21a6bf6a4a0f`
Date: 2026-07-18 KST

## Product result

Replace the legacy word-count narrator with the actual Penelope pipeline:

```text
resolved world state
→ deterministic input + scene plan
→ preflight
→ renderer
→ post-validation
→ creator review when evidence is uncertain
→ accepted-only presentation and state transition
```

The renderer may write prose. It may not decide what happened, approve a rule,
mint validation evidence, or mutate the world.

## Fixed decisions

- candidate-2.2 is the authority contract.
- T23 and T24 are both active.
- D6 decisions 1-5 are creator-approved and cover exactly seven proposed
  Odyssey rules.
- Those rules retain `basis: agent_proposed`.
- D6-4 is a creator-approved authored IF and is not source canon.
- Missing or tampered creator approval evidence disables the proposed rule.
- A hard failure or creator-review disposition cannot advance a checkpoint.
- Critic runs at most once and never after a hard failure.

## Ownership waves

### D2-A — renderer contract and port

Owner files:

- `src/contracts/world-narrator.ts`
- `src/ports/world-narrator.ts`
- `src/contracts/world-api.ts`
- `tests/unit/world-narrator.test.ts`

The adapter receives only model-facing input, scene plan, preflight receipt,
and style profile. It returns `ModelNarrationOutput` plus trace or a typed
rejection. Private validation context, render audit, trusted receipts, and
state authority never cross this port.

### D2-B — D6 approval authority

Owner files:

- `src/contracts/world-simulation.ts`
- `src/domain/world-runtime.ts`
- `src/adapters/fixtures/odyssey-world-simulation.ts`
- focused runtime/scenario tests

Separate proposal origin from approval state. Bind the public-safe creator
receipt to issuer authority, exact rule-set subject fingerprint, and payload
fingerprint. Runtime accepts proposed rules only when a server-held trusted
registry matches all bindings.

### D2-C — service and adapters

Starts after D2-A/B interfaces compile.

- service owns plan, preflight, trusted evidence production, post-validation,
  one optional critic pass, and accepted-only commit
- fixture and CLI implement the same renderer port
- CLI uses the three-layer prompt and `ModelNarrationOutput` schema
- fixture padding and 120-180-word enforcement are removed
- API receives only a derived participant-facing narration projection

### D2-D — projection and proof

- Creator Inspector separates source-grounded, creator-approved/not-source-
  canon, and pending rules
- migration guard proves zero runtime use of legacy request/output/validator
- fixture E2E covers accepted, hard-fail, and creator-review outcomes
- browser/world/API regressions remain green

## STOP conditions

- legacy and new narrator both remain runtime authorities
- adapter or model can supply private context, render audit, or trusted receipt
- a proposed rule runs without a matching trusted approval binding
- D6-4 is shown as source canon
- hard-fail or creator-review output advances state
- critic adds facts, events, licenses, or runs more than once
- generated prose is re-imported as continuity state

## Done gate

- migration TODO closed
- focused narration/runtime/API/browser tests green
- `npm run verify` green
- exact-scope commit from the checkpoint with unrelated dirty files excluded
- clean clone at the resulting SHA reproduces the same gates

## Verification receipt — 2026-07-18

- legacy runtime narrator authority removed; renderer/critic pipeline is the
  only production narration path
- D6 creator approval binding and candidate-2.2 T23/T24 enforcement active
- full local gate: 85 test files / 745 tests PASS, privacy PASS, production
  build PASS
- world browser flow: 8/8 PASS across desktop Chromium and mobile WebKit
- exact-scope commit and clean-clone reproduction remain release-owned steps
