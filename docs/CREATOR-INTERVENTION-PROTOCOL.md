# Creator Intervention Protocol

Penelope keeps prepared rehearsal choices separate from creator-authored direction. The Story Workbench does not disguise a free-text request as a fixture branch.

## A / B / C contract

- **A — Recommended:** the first `suggestedContinuations` item. It is the scenario's preferred prepared route for preserving momentum, causality, and the current dramatic question.
- **B — Second route:** the second item. It must protect a different value or accept a meaningfully different cost; it is not a cosmetic paraphrase of A.
- **C — Creator direction:** a handoff from `/story` to `/world`, not a direct Story Workbench submission.

The array order is meaningful. Scenario authors and fixture tests keep the recommendation in position 0 and the alternative in position 1. The interface never relabels a route after sorting it by display text or another incidental field.

## C interview and execution

The World Workbench elicits the creator's tacit direction through three questions:

1. What does the acting character want to obtain or protect?
2. Why does that character choose this action now?
3. What cost, risk, or exposure is the creator willing to accept?

Only after those answers are sufficient does Penelope present a world-compatible proposal and its canonical execution. The creator reviews that execution and confirms the displayed hash before it can run.

An incomplete, ambiguous, or unsupported proposal returns `stateChanged: false`. It may ask the next narrow question or explain the missing world fact, but it does not advance the story, change state, grant character knowledge, or substitute A or the first fixture branch.

## Response style

The interview may name a specific dramatic strength in the creator's direction, then ask the smallest question needed to make it executable. It must not use generic praise, exclamations, attributed quotations, or a congratulatory card as a substitute for causal reasoning.

Examples of acceptable response shape:

- “That keeps Penelope in control without forcing a public accusation. What must the test give her tonight?”
- “This asks Eurycleia to disobey Odysseus. Is she acting from loyalty to Penelope, fear of lost time, or distrust of his silence?”

## Acceptance checks

- A and B are visible in `/story`, preserve API order, and submit their registered `choiceId`.
- `/story` presents C as a link to `/world`; it has no free-text C field.
- `/world` records goal, motive, and accepted cost before exposing executable C.
- Incomplete, ambiguous, and unsupported C responses leave `stateChanged` false.
- A world-compatible C displays canonical execution and a hash-confirmation step before execution.
- No C path automatically maps to a prepared branch, emits a generic praise card, or changes canon/state without confirmation.
