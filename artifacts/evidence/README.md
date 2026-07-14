# Public evidence artifacts

This directory is the stable, public-safe evidence surface for the Build Week project.

Current generated files:

- `evidence-packet.json`: machine-readable claim states and evidence pointers
- `fixture-replay.json`: five frozen fixture cases across eight replay stages
- `graph-descriptor.json`: deterministic creator and character graph projections
- `simulation-chain.json`: proposal, approval/rebase, two transitions, and a blocked third step
- `style-ablation-readiness.json`: preregistered same-model AB/BA protocol status; `not_executed` is not a result
- `style-harness.json`: selected original profile, referenced constraints, and the human-judgment boundary
- `live-readiness.json`: current live-adapter readiness; this is not evidence of a real GPT-5.6 call
- `manifest.json`: SHA-256 and byte count for every generated public JSON artifact

`live-sanitized.json` is added only after a real GPT-5.6 call passes the local privacy gate. `style-ablation-capture-receipt.json` is written once after the preregistered four-slot capture attempt, including incomplete attempts but excluding prose and response IDs. `style-ablation.json` is added only after that receipt, capture, blind packet, and creator ratings pass the hash-chain gate and the write-once public report is finalized. Raw prose and the condition-masked review packet remain ignored. Hosted browser evidence and a public deployment URL remain separate future release gates.

Allowed live fields are timestamp, requested model, actual model, response status, token counts, validator result, and hashes of canonical request/result objects. A response ID may be hashed but is not published in raw form. Participant IDs in public artifacts must be synthetic local labels; no real account identity or remote-user claim is allowed.

Never place API keys, raw prompts, raw model prose, personal paths, browser state, private world data, or `/feedback` session IDs here. Raw local evidence and style-review packets belong under ignored `artifacts/live/`; they must never be copied into this directory without their privacy gate.
