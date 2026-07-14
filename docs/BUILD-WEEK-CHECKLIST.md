# Build Week submission checklist

Official deadline: **2026-07-22 09:00 KST**. Internal submit target: **2026-07-21 23:00 KST**.

## Administration

- [x] Eligible Devpost participant registration verified
- [x] Honest in-progress project page published
- [x] Codex credit request resubmitted with exact category and matching identity
- [ ] Credit approved (optional; not a submission blocker)
- [ ] Final Devpost submission confirmed (`submitted_at` is still null)

## Product

- [x] Track selected: Work & Productivity
- [x] Core product problem and MVP fixed
- [x] Public-safe demo direction selected
- [x] Vertical slice implemented
- [x] Participant/character ownership and authorizing/contributing intent lineage verified
- [x] Original creator-owned style profile applied and visibly separated from canon/knowledge
- [x] Canon/knowledge graph perspective and stable descriptor verified
- [x] Two chained state transitions and snapshot hashes verified
- [ ] Real GPT-5.6 use verified
- [x] Five-case frozen replay before/after comparison complete
- [x] Red-sail proposal plus `idle → watching → signal_seen` scenario replay complete
- [ ] Hosted reviewer-ready fixture demo available

## Repository

- [x] Local Git repository initialized
- [x] MIT license candidate added
- [x] Node and dependency versions declared
- [x] `.env.example` added without secrets
- [x] Sample data and source policy added
- [x] Technical setup draft available in `docs/START-HERE.md`
- [x] Local evidence generation, lint, typecheck, 77 tests, privacy scan, production build, audit with 0 vulnerabilities, and 6 browser checks passed
- [x] Fresh-copy install and full release gate verified
- [x] Fixture Evidence Packet completed from executable fixtures and source checks; browser smoke is verified separately
- [ ] Sanitized real GPT-5.6 evidence added to the packet
- [ ] Public README derived after evidence and write-mode preflight pass
- [ ] Public GitHub remote created and pushed
- [ ] CI passes on the public commit

## Required submission material

- [ ] Final project name locked across Devpost, repository, video, and demo
- [ ] Category selected in Devpost
- [ ] Project description finalized
- [ ] Built-with list reflects only technologies actually used
- [ ] Public YouTube demo under three minutes
- [ ] Voice narration explains product, Codex use, and GPT-5.6 use
- [ ] Submission material is in English or includes a clear English translation
- [ ] Repository URL entered
- [ ] Setup and sample-data instructions visible from README
- [ ] Core Codex task `/feedback` session ID entered privately
- [ ] Public open-source license visible

## Privacy and evidence

- [x] No keys or secret-bearing files
- [x] No private world, private knowledge-base content, raw chat, or personal path
- [x] Fixture and live results visually distinct; public UI says `FIXTURE MODE · NO LIVE CALL`
- [ ] Actual response model and sanitized request metadata captured
- [x] Public sanitized fixture evidence written under `artifacts/evidence/`; raw live material remains ignored
- [ ] Claims in Devpost, README, video, and repository match the same evidence ledger

## Active blockers

1. Live GPT-5.6 access and one sanitized real response trace are still required; the adapter alone is not live evidence.
2. README write-mode is `SERVING_STALE`; Vault Claude must refresh the package manifest before README generation.
3. Final product name, public GitHub remote, CI, and hosted fixture deployment remain open.
4. Public narrated video, `/feedback` session field, and final Devpost submission remain external actions.
5. Practitioner/user productivity evidence does not exist and must not be claimed.

## Final release closure

- [x] Day-0 health flags updated to reflect the implemented core truth
- [x] `AGENTS.md` phase and current-state claims updated
- [ ] Final repository commit is clean and matches the deployed source

Current local proof is recorded in `docs/BUILD-WEEK-COMMAND-CENTER.md`, `docs/EVIDENCE-LEDGER.md`, and `artifacts/evidence/manifest.json`. `docs/SCAFFOLD-VERIFICATION.md` is the historical Day-0 baseline. A local or fresh-copy PASS is not a public CI, live-model, deployment, or submission PASS.
