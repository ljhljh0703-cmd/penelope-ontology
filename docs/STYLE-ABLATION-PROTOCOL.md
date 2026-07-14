# Style controllability ablation

Status: **protocol verified; live capture not executed**.

## Question

Can an explicit creator-owned style bundle make one fixed GPT-5.6 narrative task more controllable than common instructions alone?

This is not a Fable/Opus comparison, a general prose-quality benchmark, a user study, or evidence that Codex is the better writer. Codex's role is to turn tacit writing requirements into an executable harness and an auditable evaluation.

## Preregistered design

- one synthetic Penelope/Eurycleia scene
- one requested model: `gpt-5.6`
- one reasoning setting: `medium`
- one output ceiling: `max_output_tokens=4096` (visible output and reasoning share this budget)
- one per-call timeout: 90 seconds
- one strict output object: `{ narrative: string }`
- two pairs and four calls: control/profiled, then profiled/control
- identical brief, participant intents, character views, instructions, and output schema
- only `creatorStyleBundle` changes
- SDK retries: `0`; failed slots are recorded and never replaced under the evaluation ID
- raw capture and condition-masked prose stay under ignored `artifacts/live/style-ablation/`
- a prose-free public capture receipt is written once even when the capture is incomplete, so the same evaluation ID cannot spend another four calls

The control is named `default_instruction_control`, not “unbounded”: both conditions retain the same safety, world, and output instructions. The profiled condition additionally receives the seven registered constraints in `style.table_ready_mythic`, including cadence and the 180-word bound.

## Evaluation

The deterministic check evaluates the registered word bound. A creator then scores each condition-masked sample from 0 to 2 on limited viewpoint, present tense, playable subtext, cadence, decision-bearing lines, and preservation of uncertain knowledge.

The public status is fail-closed:

- `incomplete`: capture or integrity invariant failed
- `objective_only`: all calls completed, but creator ratings are absent
- `supported_on_probe`: both profiled samples pass every objective check, improve on their paired control in the creator rubric, and worsen no registered human criterion
- `inconclusive`: complete evidence does not move in one direction across both pairs
- `not_supported_on_probe`: an objective requirement fails or the profiled condition does not improve

The final report contains hashes, model identity, word counts, aggregate scores, and integrity flags. It excludes raw prose, response IDs, token-usage details, API keys, and filesystem paths. The plan hash binds capture, receipt, blind packet, ratings, and report; ratings also bind the exact blind-packet hash. The public receipt and final report are write-once.

## Run procedure

1. Confirm `data/evals/style-ablation-plan.json` is unchanged and no raw capture, public capture receipt, or final report exists for its `evaluationId`.
2. Set `ENABLE_OPENAI_LIVE=true` and `OPENAI_API_KEY` in the local shell.
3. Run `npm run eval:style:capture` exactly once. It writes a prose-free public receipt. If any slot fails, retain the capture and receipt, then create a new evaluation version instead of retrying or replacing it.
4. Open the ignored `blind-packet.json`. Without consulting the generation conditions, create a ratings JSON using its `evaluationId`, `planSha256`, `captureSha256`, `blindPacketSha256`, sample IDs, and rubric constraint IDs. Every `score` must be `0`, `1`, or `2`; `evaluatorRole` must be `creator`.
5. Run `npm run eval:style:report -- --ratings <ratings.json>`. Finalizing without ratings intentionally consumes that evaluation ID as `objective_only` because the public file cannot be overwritten.
6. Run `npm run evidence:verify`, `npm run privacy`, and the full release gate before using the result in the demo or submission.

## Claim boundary

Even `supported_on_probe` permits only this statement: on this fixed same-GPT-5.6 synthetic probe, the explicit style bundle moved the preregistered controllability measures in the intended direction. It does not establish literary quality, productivity, user preference, or vendor superiority.
