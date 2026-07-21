# Historical live story creator review

Status: **superseded historical candidate; not current product evidence**
Manual prose edits: **none**
Transport: **ChatGPT-authenticated Codex CLI**
Requested model: **`gpt-5.6-sol`**
Actual model: **not independently reported (`null`)**

> This file preserves an earlier Red-Sail review candidate and its rejection history. The current product hero is the Book 19 World Workbench. Current requested-model claims and hashes live in `docs/EVIDENCE-LEDGER.md`; do not copy this file's Sol request or output hashes into submission copy.

The output SHA-256 values below are the run trace's recorded hashes of the complete structured messages. This public review packet preserves the unedited prose, not the deleted temporary structured files, so the hashes are not independently recomputable from this Markdown alone.

This packet reviews one complete bounded arc. Scene 1 is the registered opening fixture. Scenes 2 and 3 were generated consecutively through the live Story Workbench lane and committed only after schema, hidden-knowledge, action-boundary, registered reserved-action, causal-echo, next-choice, and closure checks passed.

## What the rejected runs changed

The failures were retained as product evidence rather than hidden.

- An early Scene 2 made Telemachus lift the lamp and start toward the east gate, even though moving the lamp was the next user-owned choice assigned to Penelope. Output SHA-256: `42a865c66cdbcaefbaf3ec8d410c31f1160a4c455e6b82c48894cfceb8412f34`. Verdict: **revise**. The runtime now registers bounded English guards for every reserved Red-Sail action, rejects completed or underway reserved actions, and rejects explicit actor transfer.
- A later pair passed its original gates but was superseded when adversarial review found that a hidden proper noun still reached the model inside a prohibition and that the semantic backstop covered only the observed lamp transfer. Output SHA-256: `fd1ce9626ae93f0d32e4d039ee26fe0b8ad82772ee69e9ab2d050a6d064cf0be`, `76733b90af86601907f4c5dd0315fd4b1cc845ebce8f915efb1d20c74b74ca3f`. Its prose did not reveal the hidden place, but it is not valid evidence for the corrected safe-input claim.
- The first corrected-input pair passed every machine gate, but Scene 2 placed fresh oil beneath the same lamp the characters had just carried into the scene. That made the clue's origin causally ambiguous. Output SHA-256: `fae1e841af041c25ac8bf16f3e1171d1676725035a93188baea4369c23f1452d`, `1ed02c80b82619c948c04c9142b386ec43bf2d7ae253b0637599d3ddb811ffe7`. Verdict: **revise**. The scene contract now requires a separate stone signal niche, and the prompt distinguishes new evidence from character-brought props.

## Final review candidate

### Scene 1 — The Signal

The loom stops before the messenger finishes. A red sail is holding beyond the western reef, neither entering nor turning away. The hall fills the silence with Odysseus's name before any lookout can say whose ship it is. Penelope presses the shuttle flat against the cloth. A color can summon hope faster than any king can cross the sea. Telemachus steps forward, already measuring walls, guards, and the distance to the harbor.

“Ring the bell,” Telemachus says. “If the ship is a threat, let it find Ithaca awake.”

“If it is not,” Penelope answers, “the bell will still have taught every suitor what rumor can command.”

Eurycleia sets an unlit covered lamp beside the bell rope. One choice gathers defenders and gives the whole island a story. The other keeps the story contained but asks Telemachus to carry the watch with fewer hands. Penelope looks from the rope to the dark lamp. Outside, the red sail does not move.

Human choice: **Keep a quiet watch.**

### Scene 2 — The Second Niche

Output SHA-256: `e00dec6e24c3b13f241f3b763f88816eb09ed814569fbacaa73b63aa487eefbf`

The ship turns toward the harbor as Telemachus carries Penelope’s covered lamp down the western stair. No bell follows him. No guards crowd the parapet. Her silence has kept the hall’s rumor behind stone, but it leaves only his sandals sounding beneath the wall.

He sets their lamp under its hood, then notices a wet gleam beyond its light. Three paces along the foundation, he kneels and pulls loose a narrow stone. Inside waits a second signal niche, separate from everything they brought. Fresh oil coats its basin; a blackened wick is still warm against his fingertip. On the hill, a hidden light opens once, closes, then opens again. The red sail answers by tightening its turn.

Telemachus rises too quickly and strikes his shoulder on the masonry. “That proves a watcher, not my father.” He keeps his voice low, though no one stands close enough to answer. Penelope has given him evidence and the danger of holding it alone. He looks east toward the gate, then back to the covered lamp. The ship is nearing the harbor opening. He grips the lamp’s handle and waits for Penelope’s order.

Human choice: **Move the decoy lamp.**

### Scene 3 — The False Opening

Output SHA-256: `4f2ad711ab0199a425efd17e12bba7bee856aa0b2d4f3f62cf617b04966ebf1f`

Before the red sail reaches the harbor mouth, Penelope takes the covered lamp from Telemachus and carries it through the wall passage toward the east gate. He stays beside her, one hand pressed to his bruised shoulder; Eurycleia shuts each door behind them. Penelope sets the lamp beneath the eastern arch and lifts its hood.

The hill light answers. A figure breaks from the rocks above the gate and runs down the narrow path, following the false opening. Telemachus meets him at the final turn. Sandals scrape; the man falls against the wall, and Telemachus pins his wrists while Eurycleia takes the knife from his belt. Beyond them, the red sail loosens its turn and withdraws from the harbor.

“I put you beneath that wall without telling you enough,” Penelope says. “I will not call this sail your father’s. I will call this man what the test has shown.” Telemachus releases one wrist only when she kneels to bind it herself. The prisoner stares at the covered lamp.

“Who paid you?” Penelope asks.

He closes his mouth and turns his face toward the darkened hill.

## Automated evidence

- Two generated turns completed in one session; no fixture fallback was used.
- The model-facing input contains only the allowed claim and does not contain the withheld place name or claim ID.
- Every reachable reserved Red-Sail action has an explicit bounded English semantic guard; unregistered guards fail closed.
- Scene 2 reserved `choice.move_decoy_lamp` for Penelope and did not report or narrate it as underway.
- Scene 3 closed the central question and exposed no further selectable continuation.
- Both generated scenes cite `claim.odyssey.penelope_uncertain_fate` and echo registered prior effects.
- Causal story fingerprints changed across all three scenes.
- The CLI reported exit code `0` for both generated turns.
- Actual serving-model identity and Responses API identity remain unclaimed.

## Provisional external review

These scores are a review aid, not creator acceptance.

| Criterion | Score | Evidence / concern |
|---|---:|---|
| Voice | 4 | Telemachus distinguishes a watcher from his father; Penelope later names only what the test earned. |
| Viewpoint | 5 | Scene 2 stays inside what Telemachus senses and infers; Scene 3 follows Penelope's enacted responsibility. |
| Subtext | 4 | The trust dispute is carried by danger, withheld explanation, injury, and who binds the captive. |
| Rhythm | 4 | Scene 2 slows for discovery; Scene 3 compresses into movement, capture, and refusal. |
| Image control | 5 | The covered lamp remains the single registered image and changes from test, to lure, to evidence. |
| Spatial continuity | 4 | The western stair, separate niche, wall passage, east gate, and final turn are connected; how Penelope's order reaches the waiting Telemachus remains implied. |
| Epistemic restraint | 5 | The prose refuses to convert coordination into proof of Odysseus and avoids narrator-style knowledge reports. |
| Causal satisfaction | 5 | Silence isolates a reliable signal and exposes Telemachus; the moved lamp then turns that coordination against the watcher. |
| Fair cost | 5 | Quiet preserves information and catches the spy, but Telemachus bears physical danger and an owed explanation. |
| Progress | 5 | Each scene changes what Ithaca can infer or safely do. |
| Choice ownership | 5 | Scene 2 stops with the lamp still under Telemachus's hand; Scene 3 begins only after Penelope's choice. |
| Closure | 5 | The ship is denied, the watcher is caught, and the payer remains a bounded hook rather than a new arc. |
| Playability | 5 | A GM or narrative designer can end here or continue immediately from the prisoner's refusal. |

Potential creator objection: Scene 2 leaves the delivery of Penelope's order implicit while Telemachus waits alone. Whether that ellipsis reads as clean compression or an operational gap is a human writing decision.

## Creator decision

- Verdict: `pending` (`accept`, `revise`, or `reject`)
- Blocking criterion, if any:
- Sentence-level evidence:
- Public writing-quality claim allowed after acceptance:
