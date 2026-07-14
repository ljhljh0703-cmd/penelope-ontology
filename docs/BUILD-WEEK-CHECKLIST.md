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
- [ ] Vertical slice implemented
- [ ] Participant/character ownership and authorizing/contributing intent lineage verified
- [ ] Original creator-owned style profile applied and visibly separated from canon/knowledge
- [ ] Canon/knowledge graph perspective and stable descriptor verified
- [ ] Two chained state transitions and snapshot hashes verified
- [ ] Real GPT-5.6 use verified
- [ ] Five-case frozen replay before/after comparison complete
- [ ] Red-sail proposal plus `idle → watching → signal_seen` scenario replay complete
- [ ] Hosted reviewer-ready fixture demo available

## Repository

- [x] Local Git repository initialized
- [x] MIT license candidate added
- [x] Node and dependency versions declared
- [x] `.env.example` added without secrets
- [x] Sample data and source policy added
- [x] Technical setup draft available in `docs/START-HERE.md`
- [x] Local lint, typecheck, 19 tests, production build, audit with 0 vulnerabilities, and two-width render checks passed for the scaffold
- [ ] Fresh-clone install and run verified
- [ ] Evidence Packet completed from implemented code, tests, live trace, and browser evidence
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

- [ ] No keys or secret-bearing files
- [ ] No private world, private knowledge-base content, raw chat, or personal path
- [ ] Fixture and live results visually distinct
- [ ] Actual response model and sanitized request metadata captured
- [ ] Public sanitized evidence written under `artifacts/evidence/`; raw live material remains ignored
- [ ] Claims in Devpost, README, video, and repository match the same evidence ledger

## Active blockers

1. Eight contract groups must be fixed before implementation: speaker/style-bound output, rule proposals, typed model outcomes, overlay authority, executable replay fixtures, participant/character identity, graph descriptors, and simulation scenario/state transitions.
2. The core slice must be built in a separate public-safe Codex task and end with `/feedback`.
3. The representative Penelope knowledge boundary and mythology locators must pass the source/rights gate before live demo claims.
4. Live GPT-5.6 access is required by Jul 18. The credit request is pending but optional; the plan assumes no credit.
5. `docs/START-HERE.md` is temporary and does not satisfy the final README requirement by itself.
6. The accepted planning bundle must be committed and the worktree clean before the core `/feedback` task begins.
7. The Day-0 static page still carries the old validator-only concept and working label; the core Table UI must replace it rather than treating it as current product evidence.

## Final release closure

- [ ] Day-0 health flags updated to reflect the implemented core truth
- [ ] `AGENTS.md` phase and current-state claims updated
- [ ] Final repository commit is clean and matches the deployed source

Local verification details are in `docs/SCAFFOLD-VERIFICATION.md`. A local PASS is not a CI, fresh-clone, live-model, or submission PASS.
