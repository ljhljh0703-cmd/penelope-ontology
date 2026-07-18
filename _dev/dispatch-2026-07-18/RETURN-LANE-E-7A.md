# RETURN-LANE-E-7A — conditional Gate 9 acceptance contract

Status: `APPROVED_IMPLEMENTED / CODE_PASS / EXTERNAL_EVIDENCE_PENDING`

Implementation commit: `b073be98a60685c513a334c8480aa5c515edebf8`

## Approved behavior implemented

- `live_gpt56_verified` is required only when tracked release copy or the claim
  contract requests a live GPT-5.6 narrative-generation claim.
- A separate always-required check confirms that the private submission record
  contains both a valid `/feedback` UUID and the exact Codex task designation
  `gpt-5.6`. This proves designation and record presence only; it does not claim
  independent serving-model verification.
- The existing feedback-session check remains mandatory.
- Missing, malformed, or stale claim-contract data fails closed.
- Claim-contract live-generation state must match the scanned public release
  copy. Requested-model, task-designation, and implementation wording cannot
  hide a same-clause authorship claim.
- The dormant Story workbench copy no longer attributes live prose to GPT-5.6;
  it reports the requested model and that actual model identity is unreported.

## Changed files

- `src/submission/readiness.ts`
- `scripts/verify-submission-readiness.ts`
- `docs/submission/CLAIM-CONTRACT.json`
- `docs/submission/SUBMISSION-RECORD.example.json`
- `components/story/StoryWorkbench.tsx`
- `tests/unit/submission-readiness.test.ts`
- `tests/unit/submission-readiness-collector.test.ts`

## Verification

- Focused Gate tests: `20/20 PASS`.
- Full `npm run verify`: PASS (`76 files / 603 tests`, privacy and production
  build included).
- TypeScript, ESLint, JSON parse, and `git diff --check`: PASS.
- Independent adversarial review: `24/24` attack/control expectations matched.
  It covers direct authorship, explicit negation, requested-model carry across
  paragraph breaks, strong model pronouns, ambiguous `it`, and the bounded
  two-clause carry limit.
- All `35` tracked Markdown/MDX/TSX release surfaces under
  `README.md`/`docs`/`app`/`components` scanned with live-claim positives `0`.

## Remaining external evidence

- The existing ignored submission record remains backward-compatible and has
  no `/feedback` value or task-model designation yet. The new required check is
  expected to fail until the owner records both after `/feedback` is issued.
- Implementation commit: `b073be98a60685c513a334c8480aa5c515edebf8`.
- No private record or Vault file was changed.
