# RETURN — World-first Odyssey simulation

Date: 2026-07-17
Branch: `codex/story-wow-vertical-slice`
Status: `IMPLEMENTATION_VERIFIED / DIRTY_TREE / CREATOR_REVIEW_REQUIRED`

## Outcome

Implemented **The Night of the Scar**, a bounded Odyssey world simulation in
which deterministic world state and causal rules resolve before prose.

The user-visible `/world` workbench now supports:

- a source-bounded Penelope session with three palace zones and four actors;
- free-text action resolution plus runtime-owned suggested actions;
- private character knowledge, NPC agendas, flags, clocks, and causal receipts;
- an immutable parent checkpoint and explicit IF branch;
- canon-contained, controlled-discovery, plan-compromised, and timeout endings;
- fixture narration or loopback-only local Codex CLI narration;
- a participant projection and separate same-user creator projection;
- rule provenance that distinguishes four source-grounded rules from seven
  creator-review-required simulation proposals.

No branch selects prewritten ending prose. Registered action and reaction rules
produce state and receipt hashes; narration receives only the focal rendering
boundary afterward.

## Source boundary

The implementation uses original summaries of the public-domain *Odyssey*.
Perseus Book 19 and Book 23 locators were manually checked on 2026-07-17. Tests
preserve the source receipt and premise references, but do not refetch or hash
the remote pages.

The source-grounded rule set covers scar recognition, immediate containment,
bounded testimony, and the contained route. Melantho investigation behavior,
controlled discovery, compromise thresholds, and timeout are explicitly marked
as authored preview rules pending creator review.

## Adversarial repairs completed

- Replaced substring action matching with word/phrase boundaries, negation
  handling, and multi-action rejection.
- Bound session validation to replayed receipts, causal-ledger ancestry, state,
  knowledge, targets, effects, and ending.
- Preserved sequential NPC causality and stopped satisfied agendas from firing.
- Prevented one checkpoint from advancing the same mainline twice, including
  concurrent requests; explicit IF forks remain allowed.
- Removed creator receipts and raw effects from participant JSON and deleted the
  deprecated composite public schema/builder.
- Moved creator state to a separate endpoint with an ephemeral, server-hashed
  same-session capability and `no-store` responses.
- Removed hidden-identity and hidden-plan hints from pre-grant model input.
- Added bounded identity phrase/equivalence regression checks.
- Stopped generated prose from becoming next-turn authority; continuation memory
  is rebuilt from registered focal-visible events.
- Marked narration as a draft and clarified that local creator projection is not
  account authentication.
- Added schema-validated source/agent provenance and review state to reaction and
  ending rules, then surfaced it in the creator inspector.

## Verification evidence

- Focused world/campaign suite before final integration: 7 files, 77 tests PASS.
- Final focused source/runtime/service/API/narrator suite: 5 files, 61 tests PASS.
- `npm run verify`: PASS.
  - evidence generation/verification: 7 files PASS;
  - ESLint: PASS;
  - TypeScript: PASS;
  - Vitest: 76 files, 600 tests PASS;
  - privacy scan: 312 files PASS;
  - Next.js production build: PASS;
  - Next trace privacy: 18 manifests / 2,428 files PASS.
- Production Playwright world flow: Chromium desktop and WebKit mobile, 6/6
  PASS.
- `git diff --check`: PASS.
- Packet SHA-256: `1a44e0a146b27adeedfbf3defc91ca04333930ed85970e603e26a7ad9177e2b2`.
- Creator-review SHA-256: `66cf36e9f82a9417750a0b1723502f2f597b117f2b5174864846550bd3d2d751`.

One post-fix local Codex CLI narration completed:

- requested model: `gpt-5.6-sol`;
- adapter: `world_narrator_codex_cli_v1`;
- trace provenance: `model`;
- exact resolved model identity: not reported by the trace;
- validated output: **At the Hearth**, 144 English words;
- pre-grant request scan: no Odysseus/Ulysses/Laertiades alias, identity-
  concealment wording, or hidden-plan phrase.

The review copy is preserved in `docs/WORLD-FIRST-CREATOR-REVIEW.md` without raw
CLI logs, user paths, credentials, or session identifiers.

## Changed file groups

- Packet and review: `_dev/WORLD-FIRST-ODYSSEY-DISPATCH.md`,
  `docs/WORLD-FIRST-CREATOR-REVIEW.md`.
- World contracts/domain: `src/contracts/world-simulation.ts`,
  `src/contracts/world-runtime.ts`, `src/contracts/world-narrator.ts`,
  `src/contracts/world-api.ts`, `src/domain/world-runtime.ts`,
  `src/domain/campaign.ts`.
- World fixtures/adapters: `src/adapters/fixtures/odyssey-world-simulation.ts`,
  `src/adapters/fixtures/world-narrator.ts`,
  `src/adapters/codex-cli/world-narrator.ts`,
  `src/ports/world-narrator.ts`.
- Application/API: `src/application/world-simulation-service.ts`,
  `src/application/world-session-store.ts`, `app/api/world/**`.
- Workbench: `app/world/**`, `components/world/**`.
- Verification: `tests/unit/campaign-ledger.test.ts`,
  `tests/unit/world-*.test.ts`, `tests/unit/odyssey-world-simulation.test.ts`,
  `tests/unit/codex-cli-world-narrator.test.ts`,
  `tests/browser/world-flow.spec.ts`.

## Remaining truth limits

1. Current-turn model prose is not a formal semantic entailment proof. A novel
   paraphrase can still reveal a withheld concept, or a sentence can invent an
   event while citing valid grounding IDs. The prose cannot mutate state or
   canon and is not persisted as future authority, but `hallucination-free` and
   `hidden knowledge can never leak` are prohibited claims.
2. Seven causal/ending rules and all four style constraints require creator
   approval or revision. They must not be called creator-approved yet.
3. The store is process-local, limited to 64 checkpoints, and expires after 30
   minutes. It is not persistent, recoverable, authenticated multi-user state.
4. No graph database, embeddings, remote room, long-running autonomous
   simulation, general inventory, or combat engine was added.
5. The 12-18 minute session duration is a UX target, not a measured result.

## Gate and next decision

The implementation, full regression, production build, privacy scan, and
desktop/mobile browser flow are verified. The worktree remains intentionally
uncommitted. No stage, commit, push, deployment, or private knowledge-base write was performed.

Creator review should decide:

1. approve/rewrite/reject the seven authored simulation rules;
2. approve/rewrite/reject the four style constraints;
3. judge the live 144-word opening as prose, especially dramatic pressure and
   character specificity;
4. after those decisions, select one complete two-turn live branch for demo
   capture rather than spending calls on uncontrolled retries.

## 2026-07-17 creator-verdict addendum

The creator rejected the 144-word live opening. The previous wording that
described it as coherent/readable is superseded as a quality judgment. The
world-first runtime evidence remains verified; literary quality does not.

Root-cause repair is intentionally paused before code changes. A document-only
An external prompt-review brief was staged outside the public product tree to redesign the renderer
contract, fixture prose strategy, and quality checks. The creator has now locked
its seven pass-1 decisions: the review brief defines the reusable form, Codex implements
and fills it, scenes require action/reaction/result, dialogue normally carries
the turn when speech is natural, length targets 80-160 words with a 180-word
maximum, and the visible fixture remains clearly labeled prepared evidence. Any
returned contract remains a candidate until creator acceptance and Codex
implementation verification.
