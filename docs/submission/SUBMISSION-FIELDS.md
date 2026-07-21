# Build Week submission field packet

Status: **portable product tree, public video, private `/feedback` record, and Devpost submission verified; exact release evidence remains in the gitignored private record**.

## Identity

- **Project name:** Penelope Ontology
- **Track:** Work & Productivity
- **Tagline:** A portable story simulator that keeps creators in charge while bounded worlds carry choices into consequences.
- **Primary users:** narrative designers, quest teams, professional game masters, and writers working inside a bounded world
- **Devpost project to update:** `1329966` / `https://devpost.com/software/narrative-ontology-harness`
- **Duplicate project to leave untouched:** `1329950` / `Untitled`

Keep **Penelope Ontology** identical across README, repository UI, Devpost, video, and hosted product. The technical repository slug may differ.

- **Public product demo:** `https://youtu.be/5oiEzLk8LWY` — Public, 2:42, narrated product/Codex/GPT-5.6 coverage verified

## Official custom fields

| Field ID | Field | Prepared answer |
|---|---|---|
| `27945` | Submitter Type | `Individual` |
| `27946` | Country of Residence | `Korea Republic of` |
| `27947` | Category | `Work & Productivity` |
| `27948` | Code repository URL | `https://github.com/ljhljh0703-cmd/penelope-ontology` |
| `27949` | Judge demo and instructions | `https://penelope-ontology.vercel.app` — no account or API key. In **The Night of the Scar**, load the guided C move and reach `Plan Compromised`; return to checkpoint 01, take the containment route, reach `Canon Contained`, and inspect Fork Compare. Then use the World Pack selector to open **Behind the Green Screen** and verify that its Oz cast, actions, and hidden fact replace the Odyssey pack without leakage. Creator JSON import is available for public-safe prepared packs; do not upload sensitive manuscripts to the hosted demo. |
| `27950` | `/feedback` Session ID | stored in the gitignored private submission record; paste into Devpost without copying it into public artifacts |
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

The Book 19 World Workbench completed four final narration turns across `Plan Compromised` and `Canon Contained`. Two earlier drafts failed closed without mutating world state. Final candidates passed the deterministic harness without manual rewriting; no human literary-quality claim is made.

## Local verification snapshot — 2026-07-22

- `npm run verify`: PASS
- unit and integration tests: PASS
- portable-world browser checks: PASS across Chromium desktop and mobile WebKit
- production browser checks: PASS across Chromium desktop and mobile WebKit
- evidence verification, ESLint, TypeScript, privacy scan, production build: PASS

Exact test counts, release SHA, CI run, and hosted exact-SHA smoke belong in the ignored release record so this tracked document cannot certify its own future commit.

## Copy sources

- Final project description: `docs/submission/DEVPOST-DRAFT.md`
- Final narration: `docs/submission/VIDEO-NARRATION.md`
- Recording sequence: `docs/submission/VIDEO-SHOTLIST.md`
- Repository entry point: `README.md`
- Claim authority: `docs/EVIDENCE-LEDGER.md`

## Completed external fields

- Devpost project name and Work & Productivity category
- public repository and credential-free hosted demo
- public narrated video
- private `/feedback` session field
- authenticated **Submitted** status readback

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
