# Build Week submission field packet

Status: **local product verified; public links, video, `/feedback`, and final Devpost submission pending**.

## Identity

- **Project name:** Penelope Ontology
- **Track:** Work & Productivity
- **Tagline:** A story engine that keeps creators in charge while controlling world logic and consequences.
- **Primary users:** narrative designers, quest teams, professional game masters, and writers working inside a bounded world
- **Devpost project to update:** `1329966` / `https://devpost.com/software/narrative-ontology-harness`
- **Duplicate project to leave untouched:** `1329950` / `Untitled`

Keep **Penelope Ontology** identical across README, repository UI, Devpost, video, and hosted product. The technical repository slug may differ.

## Official custom fields

| Field ID | Field | Prepared answer |
|---|---|---|
| `27945` | Submitter Type | `Individual` |
| `27946` | Country of Residence | `Korea Republic of` |
| `27947` | Category | `Work & Productivity` |
| `27948` | Code repository URL | pending public GitHub URL |
| `27949` | Judge demo and instructions | pending hosted URL; no account required |
| `27950` | `/feedback` Session ID | pending private UUID |
| `27951` | Plugin/developer-tool instructions | not applicable; Penelope is submitted as a Work & Productivity web app |

## Built with

- Codex
- GPT-5.6 through the Codex CLI requested-model lane
- TypeScript
- Next.js and React
- Zod
- Vitest
- Playwright
- GitHub Actions

The current story and world narration lanes request `gpt-5.6-terra`. The frozen W5 comparison remains pinned to `gpt-5.6-sol` as historical evaluation material. The CLI transport does not independently report serving-model identity, and no Responses API trace is claimed.

The Book 19 World Workbench completed four final narration turns across `Plan Compromised` and `Canon Contained`. Two earlier drafts failed closed without mutating world state. Final candidates passed the deterministic harness and delegated English-language QA without manual rewriting; this is not human creator literary acceptance.

## Local verification snapshot — 2026-07-21

- `npm run verify`: PASS
- unit/integration: 94 files, 830 tests PASS
- World browser: 7/7 PASS on Chromium
- production browser: 38/38 PASS across Chromium desktop and mobile WebKit
- evidence verification, ESLint, TypeScript, privacy scan, production build: PASS

These counts must be recertified against the final clean commit before publication.

## Copy sources

- Final project description: `docs/submission/DEVPOST-DRAFT.md`
- Final narration: `docs/submission/VIDEO-NARRATION.md`
- Recording sequence: `docs/submission/VIDEO-SHOTLIST.md`
- Repository entry point: `README.md`
- Claim authority: `docs/EVIDENCE-LEDGER.md`

## External fields still required

1. public GitHub repository URL and successful CI at the final commit;
2. hosted demo URL and smoke verification at the same commit;
3. public or unlisted YouTube URL under three minutes;
4. private `/feedback` session UUID from the main Codex task;
5. Devpost project update, category confirmation, and final submission readback.

## Final form gate

Before submission:

1. run the product from a clean install;
2. confirm README, Devpost copy, video, and UI use the same project name and claim boundary;
3. confirm public repository HEAD equals the hosted `/api/health` build SHA;
4. watch the final video and confirm it audibly covers the product, Codex, and GPT-5.6;
5. confirm no key, token, personal path, private task, raw trace, or `/feedback` ID appears publicly;
6. run `npm run submission:check`;
7. submit through Devpost and verify the project appears as **Submitted**, not Draft;
8. record authenticated readback and run `npm run submission:check:post`.

Private values belong only in gitignored `private-submission/submission-record.json`.
