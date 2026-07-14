# Build Week submission field packet

Status: **fixture-safe draft complete; live evidence and external URLs pending**.

## Identity

- **Project name candidate:** Narrative Knowledge Harness
- **Track:** Work & Productivity
- **One-line description:** A creator-controlled narrative rehearsal harness that turns raw AI prose into an inspectable scene candidate—bounded by style, character knowledge, canon approval, and replayable state transitions.
- **Primary users:** professional game masters, narrative production teams, and game scene or quest designers

The name remains a candidate until creator approval. Do not rename the repository, Devpost page, video, or hosted product independently.

## Core story

Writing-first systems may feel more distinctive than generic default Codex prose. This project does not answer that perception with a cherry-picked paragraph or an unsupported model ranking. It asks a production question instead: can voice and world coherence move out of a model's accidental personality and into a creator-owned contract?

The answer is the harness. Style constraints become registered inputs; world claims and character knowledge become scoped evidence; new lore stops at a creator gate; approved changes rerun deterministic controls and state transitions. The model proposes, the harness constrains and traces, and the creator decides. Distinctive writing is therefore treated as a reviewable production process rather than a lucky one-shot output.

## Built with

| Technology | Current evidence | Devpost treatment |
|---|---|---|
| Codex | repository implementation, usage receipt, tests, and release artifacts | include |
| OpenAI SDK 6.46.0 | installed adapter dependency and injected-client tests | include as SDK integration |
| Responses API + GPT-5.6 Structured Outputs | adapter, schema, typed failures, and capture transaction implemented; no real response captured | do not claim completed live use or select GPT-5.6 until `live-readiness.json` is verified |
| TypeScript 6.0.3 | production source and typecheck | include |
| Next.js 16.2.10 + React 19.2.7 | production application and build | include |
| Zod 4.4.3 | strict runtime contracts and Structured Output schema | include |
| Vitest 4.1.10 | 30 files / 156 tests | include |
| Playwright 1.61.1 | Chromium desktop and WebKit mobile production checks | include |
| GitHub Actions | pinned CI and deployment-smoke workflows exist | include after public CI runs |

## Copy sources

- Long project description: `docs/submission/DEVPOST-DRAFT.md`
- Under-three-minute narration: `docs/submission/VIDEO-NARRATION.md`
- Recording sequence and privacy gate: `docs/submission/VIDEO-SHOTLIST.md`
- Public-safe fixture gallery: `docs/assets/demo/manifest.json`
- Setup instructions until README approval: `docs/START-HERE.md`
- Claim authority: `docs/EVIDENCE-LEDGER.md`

## External fields still required

- public repository URL
- hosted fixture-demo URL
- public YouTube URL under three minutes
- private `/feedback` session ID
- final Devpost confirmation

## Final form gate

Before copying into Devpost, verify all five conditions:

1. `artifacts/evidence/live-readiness.json` agrees with every GPT-5.6 sentence.
2. README, Devpost copy, narration, and visible UI use the same project name and claim boundary.
3. Public repository HEAD equals hosted `/api/health` `buildSha`.
4. The video shows the actual fixture/live badge and contains spoken narration.
5. No key, raw response ID, personal path, private Codex conversation, or `/feedback` ID appears in public material.

Regenerate the gallery against a running production server with:

```bash
node scripts/capture-submission-gallery.mjs <origin>
```
