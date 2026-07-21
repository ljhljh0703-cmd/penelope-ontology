# Judge guide

This project is a fixture-first Work & Productivity web tool for professional GMs, narrative teams, and game scene or quest designers. The public demo is intentionally unable to spend OpenAI credits. It shows the same portable World Pack, validation, creator decision, transition, and replay path used around the separate controlled GPT-5.6 evidence command.

## Fastest review path

Open [the public Penelope demo](https://penelope-ontology.vercel.app). No account, credentials, or API key is required.

1. Read the Book 19 setup, then open `World Codex`. Overview establishes the dramatic question; Cast exposes each character's desire, avoidance, position, and private-premise count; Relations shows only edges declared by the sealed World Pack.
2. Click **Load the guided creator move**, then **Commit this prepared action**. Answer the three creator questions about Penelope's goal, motive, and accepted cost. No checkpoint is spent during this interview.
3. Review the proposed canonical execution and its visible state-bound receipt. Confirm it. `The Loom` shows the choice entering the world, then `World Aftermath` reports the receipt-backed movement and pressure change: Penelope gains privacy, Melantho moves offstage, begins investigating, and the suspicion clock advances.
4. Choose **Order the foot washing**. The branch reaches `Plan Compromised`: removing a witness created an investigator.
5. Return to checkpoint 01. Choose **Order the foot washing**, commit it, then choose **B · Alternate — Contain Eurycleia's recognition** and commit it to reach `Canon Contained`.
6. Open `World Codex → Branches`, then inspect `Fork Compare`. Both lines share the same source checkpoint, but their NPC position, knowledge, pressure, latent risk, and ending now differ.
7. Open `World Codex → Plot` and the creator inspector. Plot shows receipt events, inherited clocks, declared ending horizons, and creator-only latent risks; the inspector distinguishes source-grounded Book 19 facts from creator-approved IF rules and creator-review-only material.
8. Use the World Pack selector to open **Behind the Green Screen**. Its Oz cast, hidden premise, action vocabulary, reactions, and endings replace the Book 19 pack without inheriting Odyssey content.
9. Open **World Forge**, enter a two-to-three-sentence premise, and approve its 24 bounded facts. The forged pack advances through five named scenes, updates its declared relationship after each accepted route, and reaches an earned ending on turn five. `World Codex → Plot`, `Relations`, and `Branches` preserve the approved spine, realized beats, relationship history, and actual checkpoint lineage.
10. Optionally import [`examples/world-packs/creator-owned-starter.json`](../examples/world-packs/creator-owned-starter.json). **The Lantern Ledger** is strict-schema validated, sealed with a digest, and held in temporary server memory for this session. Do not upload unpublished or sensitive material to the hosted demo.

The public host is fixture-only and cannot spend OpenAI credits. Incomplete, abandoned, ambiguous, or unsupported C input leaves world state unchanged; it is never silently converted into A or B. Imported packs are neither persisted nor added to the public registry, but the hosted service is not a confidential manuscript store.

## Local setup

Requirements: Node.js 22.x and npm.

```bash
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. Fixture mode needs no environment file or API key.

To reproduce the complete local release gate:

```bash
npx playwright install --with-deps chromium webkit
npm run verify:release
```

This regenerates and verifies the Evidence Packet, lints, type-checks, runs the unit/API suite and privacy scan, creates a production build, and exercises that build through `next start` in desktop Chromium plus mobile WebKit. The identified variant also rechecks the clean exact-SHA worktree after the browser run, so a tool-generated tracked-file drift cannot be recorded as release proof.

## Production and hosted smoke

The browser suite uses `next start` in CI, after the production build. For a local production rehearsal:

```bash
git status --short
git rev-parse HEAD
BUILD_SHA=<the-exact-40-character-SHA-above> npm run build:identified
npm run start -- --hostname 127.0.0.1 --port 3210
```

`git status --short` must print nothing. `build:identified` independently rejects a mismatched SHA or any tracked or untracked worktree change; the label cannot certify dirty source.

In a second terminal:

```bash
npm run smoke:deployment -- http://127.0.0.1:3210/ <the-same-40-character-SHA>
```

Local and hosted smoke both require the exact 40-character lowercase Git SHA; `local-unset` or another friendly label can never produce release evidence. For a hosted origin, pass its HTTPS root URL and exact deployed commit SHA. Redirects are rejected. The cache-busted health response must report that same build identity. The smoke gate checks the public fixture boundary, all declared baseline security headers, health flags, grounded and conflict proofs, the proposal and creator gate, fresh approved-overlay replay, exact S0r→S1→S2 snapshot/transition hash continuity, overlay/canon continuity, and the mandatory 403 denial of public live requests. The `deployment-smoke` GitHub workflow exposes the same check as a manual action with required `base_url` and `expected_sha` inputs.

The health response must include a boolean `liveEvidenceReadinessRecorded` signal. Both `true` and an honest `false` are valid deployment states: this smoke proves the deployed fixture and its reporting contract, not completion of a private live-model trace. `submission:check` owns that separate live-evidence gate.

## What GPT-5.6 and Codex do

GPT-5.6 is bounded to structured candidates: prose, claims, actions, proposals, and trace metadata. Deterministic code—not the model—owns identity, knowledge, time, location, source-tradition, canon-expansion, creator-decision, state-transition, and replay checks.

Codex was used as the engineering partner. The project starts from a familiar skepticism: default Codex prose can feel generic. It does not turn that perception into an unsupported benchmark claim or answer it with one favorable paragraph. It turns the concern into an engineering brief. Codex helped encode voice, world knowledge, creator approval, and regression behavior as schemas, fixtures, validators, UI states, adversarial tests, evidence artifacts, and release gates. The creator still owns style, canon, taste, and final judgment.

## Evidence boundary

- Public UI and hosted APIs are fixture-only.
- The product hero is a portable bounded-world workbench. Book 19 is the main causal demonstration, Oz is the cross-world proof, and `/table` remains a supporting registered frozen two-intent forensic replay.
- Fixture output must not be described as a live GPT-5.6 response.
- Controlled local narration can request `gpt-5.6-terra` through the authenticated Codex CLI; the public host never exposes that paid path.
- Raw model prose and response IDs stay out of the public repository.
- World Forge can turn a two-to-three-sentence seed plus 24 creator-approved facts into one session-private five-scene pack with one bounded dynamic relationship. No account-based private world library, remote multiplayer room, graph database, embedding store, generalized quest generator, practitioner result, or measured productivity gain is claimed.

See `artifacts/evidence/manifest.json` for the generated public evidence inventory and `docs/EVIDENCE-LEDGER.md` for claim status.
