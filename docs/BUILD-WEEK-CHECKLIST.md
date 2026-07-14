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
- [x] Registered frozen two-intent rehearsal preserves participant/character ownership and reciprocal authorizing/contributing lineage
- [ ] Arbitrary facilitator-collected intent composition verified through a sanitized live run
- [x] Original creator-owned style profile carried as a registered harness input and referenced through stable IDs; the visible receipt separates one deterministic check from six creator-reviewed constraints
- [x] Compact narrator/character knowledge boundary and collapsed production review packet added to the judge path
- [x] Same-model style-ablation protocol, no-retry capture path, masked rubric, and fail-closed evaluator implemented
- [ ] Four GPT-5.6 style-ablation calls and creator ratings captured
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
- [x] Local evidence generation, lint, typecheck, the full unit/API suite, privacy scan, production build, vulnerability audit, and both browser projects passed
- [x] Final candidate fresh-copy install and full identified release gate verified; exact post-commit authority is stored in the ignored release record
- [x] Node 22.x pinned consistently for local, CI, and hosted runtime selection
- [x] Identified build gate requires exact HEAD plus a clean tracked/untracked worktree; hosted Git provider SHA outranks manual labels
- [x] Browser CI configured to exercise `next start` after the production build
- [x] Credential-free deployment smoke gate added for exact build identity, fixture boundary, all declared security headers, health, frozen proof, transition hash continuity, and public live denial
- [x] Applied or edited overlays trigger a fresh 4/4 server replay bound to their exact hash
- [x] Public run, decision, and transition routes reject any brief, intent, draft, style, task, overlay, or snapshot that differs from the registered frozen rehearsal
- [x] Transition authority is rederived from the registered run and creator decision; a forged self-hashed overlay returns 409
- [x] Creator display edits cannot mutate or conceal locked rule/claim semantics; proposal and graph surfaces show both authorities separately
- [x] Judge run guide and 378-word release-gated English narration script added
- [x] Current release candidate passed identified build, production browser checks, and deployment smoke in both the working repository and a clean clone
- [x] Fixture Evidence Packet completed from executable fixtures and source checks; browser smoke is verified separately
- [x] Current-tree gate passes: seven evidence files, 30 Vitest files / 156 tests, privacy 164, production build, desktop/mobile browser 10/10, and fresh desktop/mobile visual inspection
- [ ] Sanitized real GPT-5.6 evidence added to the packet
- [x] Style-ablation readiness is public and explicitly marked `not_executed`
- [x] Live capture uses a pre-dispatch recovery sentinel, exclusive lock, prose-free receipts, atomic no-clobber publication, target-race preservation, rollback, explicit retry, and injected receipt-write-failure tests
- [x] Evidence generation and health derive live verification from a bound completed-capture receipt plus the full authority/privacy shape rather than a status string
- [ ] Write-once style-ablation report finalized from live capture and creator ratings
- [ ] Public README derived after evidence and write-mode preflight pass
- [ ] Public GitHub remote created and pushed
- [ ] CI passes on the public commit

## Required submission material

- [ ] Final project name locked across Devpost, repository, video, and demo
- [ ] Devpost final category field confirmed as Work & Productivity
- [ ] Project description finalized
- [x] Evidence-safe Built-with list prepared; GPT-5.6 remains excluded from completed-use claims until the live gate passes
- [ ] Public YouTube demo under three minutes
- [ ] Voice narration explains product, Codex use, and GPT-5.6 use
- [x] Submission description, shot list, and narration are prepared in English
- [x] Five public-safe 1440×900 fixture gallery images captured with a SHA-256 manifest
- [ ] Repository URL entered
- [ ] Setup and sample-data instructions visible from README
- [ ] Core Codex task `/feedback` session ID entered privately
- [ ] Public open-source license visible

## Privacy and evidence

- [x] No keys or secret-bearing files
- [x] No private world, private knowledge-base content, raw chat, or personal path
- [x] Fixture and live results visually distinct; public UI says `FIXTURE MODE · NO LIVE CALL`
- [x] Public fixture inputs are visibly registered, frozen, and non-editable; the UI states that prompt prose does not branch fixture output
- [ ] Actual response model and sanitized request metadata captured
- [x] Public sanitized fixture evidence written under `artifacts/evidence/`; raw live material remains ignored
- [ ] Claims in Devpost, README, video, and repository match the same evidence ledger

## Active blockers

1. Live GPT-5.6 access is still required for one sanitized integration trace and the four-call style ablation; adapter and protocol tests are not live evidence.
2. README write/derive preflights are `SERVING_CANDIDATE`; explicit approval and an `--allow-candidate` rerun are required before README generation.
3. Portfolio-specific refine preflight is `SERVING_STALE`; the feedback dependency must be synchronized before canonical portfolio copy is produced.
4. Final product name, public GitHub remote, CI, and hosted fixture deployment remain open.
5. Public narrated video, `/feedback` session field, and final Devpost submission remain external actions.
6. Practitioner/user productivity evidence does not exist and must not be claimed.

## Final release closure

- [x] Day-0 health flags updated to reflect the implemented core truth
- [x] `AGENTS.md` phase and current-state claims updated
- [x] Local release-candidate commit is clean and exact-SHA verified
- [ ] Hosted deployment reports the same commit as the public repository

Current local proof is recorded in `docs/BUILD-WEEK-COMMAND-CENTER.md`, `docs/EVIDENCE-LEDGER.md`, and `artifacts/evidence/manifest.json`. `docs/SCAFFOLD-VERIFICATION.md` is the historical Day-0 baseline. A local or fresh-copy PASS is not a public CI, live-model, deployment, or submission PASS.

The public Devpost project currently exists at `https://devpost.com/software/narrative-ontology-harness`, but its final submission record is still empty. The external project title is not treated as final naming approval inside the repository.
