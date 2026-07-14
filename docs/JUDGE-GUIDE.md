# Judge guide

This project is a fixture-first Work & Productivity web tool for professional GMs, narrative teams, and game scene or quest designers. The public demo is intentionally unable to spend OpenAI credits. It shows the same structured contract, validation, creator decision, transition, and replay path used around the separate controlled GPT-5.6 evidence command.

## Fastest review path

When a verified hosted URL is supplied, no account or credentials are required. Until then, use the local fixture path below; hosting remains a release gate.

1. Confirm the header says `FIXTURE MODE · NO LIVE CALL`.
2. Review the two participant intents and the selected creator style profile.
3. Compare the character-scoped evidence views. Penelope must not receive the hidden Ogygia claim.
4. Run the red-sail scene. The candidate should stop at `Creator decision required`; it must not silently extend canon.
5. Accept or edit the proposal. Editing changes display wording only; the proposal card and graph continue to show the locked semantic rule beside that non-authoritative wording. The overlay advances from v0 to v1 while the turn remains at zero.
6. Apply both registered state steps: `idle → watching → signal_seen`.
7. Confirm the state-hash chain is continuous. The server should also show a fresh 4/4 safety-control replay bound to the exact approved overlay hash.

Rejecting a proposal must leave canon and state unchanged. A third transition must be blocked.

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

This regenerates and verifies the Evidence Packet, lints, type-checks, runs the unit/API suite and privacy scan, creates a production build, and exercises desktop Chromium plus mobile WebKit.

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

## What GPT-5.6 and Codex do

GPT-5.6 is bounded to structured candidates: prose, claims, actions, proposals, and trace metadata. Deterministic code—not the model—owns identity, knowledge, time, location, source-tradition, canon-expansion, creator-decision, state-transition, and replay checks.

Codex was used as the engineering partner. The project starts from a familiar skepticism: default Codex prose may feel less distinctive than output from writing-first systems such as Fable or Opus. It does not turn that perception into an unsupported benchmark claim or answer it with one favorable paragraph. It turns the concern into an engineering brief. Codex helped encode voice, world knowledge, creator approval, and regression behavior as schemas, fixtures, validators, UI states, adversarial tests, evidence artifacts, and release gates. The creator still owns style, canon, taste, and final judgment.

## Evidence boundary

- Public UI and hosted APIs are fixture-only.
- Fixture output must not be described as a live GPT-5.6 response.
- A live call requires both `ENABLE_OPENAI_LIVE=true` and `OPENAI_API_KEY` through the separate evidence command.
- Raw model prose and response IDs stay out of the public repository.
- No remote multiplayer room, graph database, embedding store, generalized quest generator, practitioner result, or measured productivity gain is claimed.

See `artifacts/evidence/manifest.json` for the generated public evidence inventory and `docs/EVIDENCE-LEDGER.md` for claim status.
