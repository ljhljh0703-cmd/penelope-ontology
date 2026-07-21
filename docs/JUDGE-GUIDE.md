# Judge guide

This project is a fixture-first Work & Productivity web tool for professional GMs, narrative teams, and game scene or quest designers. The public demo is intentionally unable to spend OpenAI credits. It shows the same structured contract, validation, creator decision, transition, and replay path used around the separate controlled GPT-5.6 evidence command.

## Fastest review path

Open [the public Penelope demo](https://penelope-ontology.vercel.app). No account, credentials, or API key is required.

1. Read the Book 19 setup, then inspect `World Pulse` and Melantho's NPC card. Before the first choice, she is within earshot and already wants to discover irregular behavior.
2. Click **Load the guided creator move**, then **Commit this prepared action**. Answer the three creator questions about Penelope's goal, motive, and accepted cost. No checkpoint is spent during this interview.
3. Review the proposed canonical execution and its visible state-bound receipt. Confirm it. Penelope gains privacy by dismissing Melantho; Melantho moves offstage, begins investigating, and the suspicion clock advances.
4. Choose **Order the foot washing**. The branch reaches `Plan Compromised`: removing a witness created an investigator.
5. Return to checkpoint 01. Choose **Order the foot washing**, commit it, then choose **B · Alternate — Contain Eurycleia's recognition** and commit it to reach `Canon Contained`.
6. Inspect `Fork Compare`. Both lines share the same source checkpoint, but their NPC position, knowledge, pressure, latent risk, and ending now differ.
7. Open the creator inspector to distinguish source-grounded Book 19 facts from creator-approved IF rules and creator-review-only material.

The public host is fixture-only and cannot spend OpenAI credits. Incomplete, abandoned, ambiguous, or unsupported C input leaves world state unchanged; it is never silently converted into A or B.

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

Codex was used as the engineering partner. The project starts from a familiar skepticism: default Codex prose may feel less distinctive than output from writing-first systems such as Fable or Opus. It does not turn that perception into an unsupported benchmark claim or answer it with one favorable paragraph. It turns the concern into an engineering brief. Codex helped encode voice, world knowledge, creator approval, and regression behavior as schemas, fixtures, validators, UI states, adversarial tests, evidence artifacts, and release gates. The creator still owns style, canon, taste, and final judgment.

## Evidence boundary

- Public UI and hosted APIs are fixture-only.
- The product hero is a bounded Book 19 world simulation; `/table` remains a supporting registered frozen two-intent forensic replay.
- Fixture output must not be described as a live GPT-5.6 response.
- Controlled local narration can request `gpt-5.6-terra` through the authenticated Codex CLI; the public host never exposes that paid path.
- Raw model prose and response IDs stay out of the public repository.
- No remote multiplayer room, graph database, embedding store, generalized quest generator, practitioner result, or measured productivity gain is claimed.

See `artifacts/evidence/manifest.json` for the generated public evidence inventory and `docs/EVIDENCE-LEDGER.md` for claim status.
