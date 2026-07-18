# DISPATCH — Lane D3 creator-review adoption path

Status: `IMPLEMENTED_VERIFIED / EXACT_SCOPE_COMMIT_PENDING`
Date: 2026-07-18 KST
Depends on: Lane D2 runtime migration

## Product result

Free Codex prose that is structurally valid but semantically uncertain must not
end as a generic error. It becomes a private, folded creator proposal:

```text
resolved candidate state + Codex prose
→ hard validation passes, creator review remains
→ HTTP 202 pending draft (world state unchanged)
→ approve / edit prose and approve / reject
→ exact authority and hash recheck
→ approved-only checkpoint commit
```

This implements the fixed product rules:

- question + folded candidate; no canon/state inclusion before approval
- TRPG pace: show the result immediately, then allow approval or a prose edit
- generated or edited prose never becomes continuity fact input
- hard failure can never enter the proposal lane

## Reused wheel

Apply the authority pattern from:

- `src/application/live-creator-review.ts`
- `src/contracts/creator-decision.ts`
- `src/application/live-creator-finalizer.ts`

Reuse means exact base authority, proposal hash, one-use decision, reject leaves
state unchanged, and recomputation before finalization. Do not import the
red-sail-specific domain objects.

## Fixed scope

- Opening remains the deterministic prepared fixture even when the selected
  transport is `codex_cli`; live prose begins on resolved turns. This avoids a
  root draft without weakening the live demo.
- Only a `creator_review` result with `hardPass: true` may create a draft.
- `hard_fail`, `no_render`, `needs_authoring`, and renderer rejection stay 422.
- One pending draft per base checkpoint. TTL and one-use semantics are required.
- Editable surface is paragraph text only. Plan receipts, paragraph IDs,
  sentence-plan IDs, candidate session, receipt, and trace are immutable.
- Approval re-runs the pipeline against the captured output (or edited prose)
  and requires no hard finding. Remaining creator-review findings are satisfied
  by the exact human decision receipt.
- Approval re-reserves the base checkpoint and rechecks the base state hash
  before saving. Reject and stale/tampered decisions save nothing.

## Required bindings

Each pending draft binds at least:

- draft ID and draft hash
- base checkpoint ID and base state hash
- candidate state hash and receipt hash
- model-output hash
- transport and fork intent
- creator capability inherited from the base checkpoint
- creator-review rule IDs
- expiry and consumed status

## API/UI

- Turn route: accepted = 200 view; creator review = 202 draft view.
- New decision route: `approve | edit | reject` with all binding hashes.
- UI: plain-language question, candidate inside `<details>` closed by default,
  `Approve & continue`, `Edit text & approve`, `Discard`.
- A pending draft never appears in checkpoint navigation.

## Done gate

- 202 creates no checkpoint and does not advance mainline
- exact approval creates exactly one checkpoint
- edit re-runs hard validation
- reject, stale, tampered, expired, and replayed decisions change no state
- hard failure never creates a draft
- approved prose is not stored as next-turn visible memory
- focused unit/API/browser tests, typecheck, lint, full verify

## Verification receipt — 2026-07-18

- creator capability and session transport are checked before live rendering
- pending drafts are hash-bound, absolute-TTL-bound, one-live, and one-use
- approve/edit revalidation, reject, replay, tamper, expiry, concurrency, and
  injected save-failure paths are covered
- approved checkpoint insertion, decision receipt persistence, and draft
  consumption execute as one synchronous store operation
- creator-only decision proof is exposed without participant or continuity leak
- D3 adversarial audit: P0/P1/P2 residual defects 0
- full local gate: 85 test files / 745 tests PASS; world browser 8/8 PASS
