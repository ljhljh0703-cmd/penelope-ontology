# RETURN — Fate Frame Phase B

Status: `PHASE_B_IMPLEMENTED / VERIFIED / NOT_PUSHED`

## Outcome

Penelope now renders a **Fate Frame** beside the story when the deterministic
world runtime reaches an approved high-value trigger. The frame is a limited-
color ASCII illustration candidate derived only from public scene facts. It is
shown immediately, but it does not become a checkpoint asset until the creator
approves it.

This phase deliberately uses a deterministic fixture provider rather than a
live image API. It proves the product contract, privacy boundary, creator
approval flow, responsive layout, and repeatable rendering without spending
credits or claiming semantic image-generation quality.

## Implemented behavior

- Trigger taxonomy: irreversible choice, ending divergence, secret reveal,
  dramatic-clock threshold, and scene climax.
- Automatic Phase B selection is intentionally narrow: completed endings and
  post-turn forks only. Ordinary turns do not create frames.
- A strict visual request accepts visible facts and visible events only;
  unknown/private fields are rejected.
- A deterministic 48 x 24 grayscale fixture is converted into limited-color
  ASCII through a Bayer 4 x 4 ordered-dither renderer.
- The same request produces the same source and render hashes. Changing the
  variant produces a different candidate.
- Candidate states: generating, candidate, approved, reference-only, rejected,
  and failed.
- Only `approved` sets `bindsToCheckpoint: true`. Reference-only and rejected
  candidates remain outside canon.
- Candidate failure is non-blocking: the story remains usable and the creator
  can retry.
- Desktop presents the frame and story in a 55:45 composition; narrow screens
  stack them without hiding story controls.
- An approved decision persists while the creator moves between checkpoints in
  the current browser session.

## Changed files

- `src/contracts/visual-moment.ts`
- `src/ports/illustration-provider.ts`
- `src/adapters/fixtures/illustration-provider.ts`
- `src/domain/ascii-renderer.ts`
- `src/domain/visual-moment.ts`
- `src/application/visual-moment-service.ts`
- `app/api/world/visual/route.ts`
- `components/world/FateFrame.tsx`
- `components/world/FateFrame.module.css`
- `components/world/WorldWorkbench.tsx`
- `components/world/WorldWorkbench.module.css`
- `tests/unit/visual-moment.test.ts`
- `tests/unit/visual-moment-api.test.ts`
- `tests/browser/world-forge.spec.ts`

## Verification evidence

- TDD RED: the focused visual-moment contract/API suites initially failed
  because the contract and route did not exist.
- Focused unit/API: **2 files, 7 tests PASS**.
- Full Vitest: **107 files, 888 tests PASS**.
- TypeScript: **PASS**.
- ESLint: **PASS**.
- Privacy scan: **PASS — 427 files scanned**.
- Production build: **PASS**, including `/api/world/visual`.
- Next trace privacy: **PASS — 21 manifests, 2,742 files**.
- Focused browser acceptance: **2/2 PASS** on desktop Chromium and mobile
  WebKit, including checkpoint approval persistence.
- Full browser regression: **42/42 PASS**.
- `git diff --check`: **PASS**.

## Gates and honest limits

- No live external image/model call was made.
- The fixture proves a symbolic branch-art workflow, not semantic illustration
  quality. Live GPT image integration remains a separate, explicitly approved
  phase.
- Approved visual decisions currently persist in browser component state. A
  durable local export/import package is Phase C.
- The five-scene episode expansion is Phase D.
- No push, deployment, video generation, or private knowledge-base write was performed.

## Next recommended action

Implement Phase C local export/import as `.penelope.json` plus a readable
`.md` companion, including approved Fate Frames only.
