# RETURN — Portable World Pack release candidate

Date: 2026-07-21
Branch: `codex/portable-world-pack`
Base: `e9ada6abe0cc24a8fb6d1ef39aa466771f6c7424`
Status: `IMPLEMENTATION_COMPLETE / LOCAL_TREE_VERIFIED / EXTERNAL_RELEASE_GATES_PENDING`

## Outcome

Penelope Ontology is no longer an Odyssey-only vertical slice. The same World
Workbench now runs:

- **The Night of the Scar**, the Book 19 causal demonstration;
- **Behind the Green Screen**, an independent Oz Chapter XV rehearsal;
- a strict creator-owned JSON World Pack held only for one root-fixed temporary
  session.

Every session is bound to one sealed pack ID, semantic version, and canonical
digest. The runtime receives its cast, premises, actions, reaction rules,
endings, creator-input vocabulary, hidden-knowledge boundary, and render policy
from that pack instead of inferring Odyssey behavior from a scenario name.

## Product behavior added

- Registered pack selector and creator JSON import in `/world`.
- Public-safe creator sample: **The Lantern Ledger**.
- A/B policy contract: every reachable recommendation state exposes at least
  two distinct focal-character actions.
- C preserves the creator's free direction, asks for goal, motive, and accepted
  cost, and cannot execute until its exact proposal hash is confirmed with the
  creator capability.
- Creator-only curtain ledger explains hidden premises and latent risks while
  participant prose and participant JSON omit them.
- Child checkpoints cannot change pack, even when two definitions reuse a
  scenario ID.
- Declared offstage reactions remain supported; autonomous idle NPC scheduling
  remains outside this release.

## Adversarial repairs completed

1. Bound fixture and Codex-CLI C confirmation to the creator capability while
   leaving non-mutating clarification accessible.
2. Replaced rolling child-checkpoint retention with one server-only root expiry;
   late children and pending narration artifacts cannot extend private data
   beyond that lease.
3. Added a narrow seal-time hidden-secret gate for unconditional pre-action
   participant/narrator surfaces. Deliberate character questions and authorized
   later reveals remain available to the dynamic knowledge validator.
4. Locked this release to the reviewed English lane and rejected packs that
   advertise unimplemented locale output.
5. Rejected recommendation policies with NPC actions, one-choice A/B states, or
   an uncovered boolean branch.
6. Corrected public claims: 262,144 bytes applies to the complete session-start
   request; The Lantern Ledger is creator-attested original material rather
   than machine-proven originality.
7. Separated three portable-product captures from the locked five-image legacy
   submission gallery and bound the supplementary images to exact bytes,
   hashes, dimensions, and privacy review.
8. Cut the English demo narration to 373 spoken words with a 2:30–2:45 shot
   plan.
9. The first tracked-copy gate caught a negative boundary bullet that its claim
   parser could misread as a positive outcome claim; the wording was narrowed
   before exact-SHA recertification.

## Changed file groups

- Pack contract and registry: `src/contracts/penelope-world-pack.ts`,
  `src/adapters/world-packs/**`, `src/contracts/world-simulation.ts`.
- Session and runtime: `src/application/world-session-store.ts`,
  `src/application/world-simulation-service.ts`, `src/domain/world-runtime.ts`,
  `src/domain/creator-c-dialogue.ts`.
- API and workbench: `app/api/world/**`, `app/world/**`,
  `components/world/**`.
- Creator sample and authoring surface: `examples/world-packs/**`,
  `docs/WORLD-PACK-AUTHORING.md`.
- Product, evidence, and submission copy: `README.md`,
  `docs/PORTABLE-WORLD-PACK-EVIDENCE.md`, `docs/EVIDENCE-LEDGER.md`,
  `docs/submission/**`, and supporting start/judge/architecture documents.
- Verification: portable contract, import, retention, API, gallery, and
  desktop/mobile browser tests under `tests/**`.

## Verification

`npm run verify`: **PASS**.

- evidence generation and byte verification: 7 files PASS;
- ESLint and TypeScript: PASS;
- Vitest: 103 files, 872 tests PASS;
- privacy scan: 406 files PASS;
- Next.js production build: PASS;
- trace privacy: 19 manifests and 2,525 traced files PASS.

The finalized current tree also passed all 40 production browser checks across
desktop Chromium and mobile WebKit after the adversarial product-code repairs.
The next gate is to bind the same suite to the final clean commit with
`npm run verify:release:identified`.

## Claim boundaries

This candidate does **not** implement or claim:

- arbitrary manuscript-to-pack ingestion or a conversational world builder;
- persistence, accounts, collaboration, encrypted manuscript storage, or a
  confidentiality guarantee;
- autonomous idle NPC schedules, a long-running agent society, or persistent
  campaigns;
- graph-database, embedding, formal Semantic Web, or multilingual runtime
  support;
- measured literary superiority, creator productivity, adoption, or human
  prose acceptance.

The participant-facing static leak guard is bounded to registered exact
forbidden patterns and pre-action surfaces. Later prose still requires the
existing dynamic validators and creator gate; it is not a formal semantic
non-disclosure proof.

## Evidence-skill gate

The certified `package-project-evidence` **audit** mode was applied for Repo
Truth Audit and Claim Parity. Its README **write** adapter returned
`SERVING_STALE`, so no stale delegate, template, or Juhyeong voice rule was
used. README and submission copy were instead checked directly against code,
tests, and the portable claim ledger.

## Remaining gates

1. create one exact-scope local commit and rerun the clean exact-SHA release
   gate;
2. push the approved commit, wait for GitHub CI, deploy it, and run the
   cache-busted hosted exact-SHA smoke;
3. record and verify the narrated public/unlisted YouTube video under three
   minutes;
4. add the private `/feedback` session ID only to the ignored submission record
   and Devpost form;
5. update and submit the existing Devpost project, then run post-submit owner
   readback.

No push, deployment, video upload, Devpost mutation, or Vault write was
performed in this packet.
