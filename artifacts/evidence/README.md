# Public evidence artifacts

This directory is the stable, public-safe evidence surface for the Build Week project.

Planned generated files:

- `fixture-replay.json`: frozen fixture outcomes before and after an approved overlay
- `intent-composition.json`: synthetic participant-to-character ownership and output-lineage assertions
- `style-profile-check.json`: selected original style profile, objective constraint checks, and separately labeled human-rubric status
- `graph-snapshots.json`: stable creator/character graph descriptors and proposal/approval diff hashes
- `simulation-replay.json`: `idle → watching → signal_seen` transitions, chained state hashes, and unchanged-state negative cases
- `live-sanitized.json`: sanitized metadata from at least one real GPT-5.6 run
- `browser-smoke.json`: reviewer-path browser assertions and tested deployment URL
- `claim-ledger.json`: machine-readable claims and evidence pointers used by README, Devpost, video, and portfolio copy

Allowed live fields are timestamp, requested model, actual model, response status, token counts, validator result, and hashes of canonical request/result objects. A response ID may be hashed but is not published in raw form. Participant IDs in public artifacts must be synthetic local labels; no real account identity or remote-user claim is allowed.

Never place API keys, raw prompts, raw model prose, personal paths, browser state, private world data, or `/feedback` session IDs here. Raw local evidence belongs under ignored `artifacts/live/`; it must never be copied into this directory without the privacy gate.
