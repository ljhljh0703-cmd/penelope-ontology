# Penelope Ontology — World-first creator review

Status: implementation candidate; live prose rejected; authored-rule canon pending

## What this proof is

**The Night of the Scar** is a bounded, one-session Odyssey simulation. The
world state resolves first; narration renders the result afterward.

```text
checked source and authored world rules
-> private character knowledge and agendas
-> participant action or explicit IF fork
-> deterministic NPC reactions and causal receipt
-> ending evaluation
-> scoped narration draft
```

The proof uses original summaries of the public-domain *Odyssey*. The Book 19
and Book 23 Perseus pages were manually checked on 2026-07-17:

- [Odyssey, Book 19](https://www.perseus.tufts.edu/hopper/text?doc=Perseus%3Atext%3A1999.01.0136%3Abook%3D19)
- [Odyssey, Book 23](https://www.perseus.tufts.edu/hopper/text?doc=Perseus%3Atext%3A1999.01.0136%3Abook%3D23)

## What the world actually computes

The shared first turn is not a prewritten scene choice. `bring the basin`
resolves to the registered foot-washing action. Eurycleia recognizes the scar,
gains private identity knowledge, and Odysseus contains her first reaction. The
same resulting checkpoint can then continue on its parent branch or fork into
an explicit counterfactual.

| Route | Accepted actions | Computed consequence | Ending |
|---|---|---|---|
| Contained baseline | bring the basin -> observe | Melantho approaches and suspicion rises, but recognition stays inside the original private circle | `canon_contained` |
| Controlled IF | bring the basin -> ask Eurycleia to answer privately | Penelope earns identity knowledge; exposure cost rises without informing the wider household | `controlled_discovery` |
| Compromised IF | dismiss Melantho -> bring the basin | dismissal gives Melantho a reason to investigate; she witnesses the nurse's shock and alerts a suitor-aligned servant | `plan_compromised` |

Changing the second action preserves the first receipt and changes only the
causal suffix. Unsupported input receives no registered action benefit, while
the six-turn bound still prevents an endless session.

## Actual local Codex CLI narration

Captured from the current local CLI adapter after the pre-grant request was
checked to contain no Odysseus/Ulysses/Laertiades alias, no identity-concealment
description, and no hidden-plan phrase.

- adapter trace: `world_narrator_codex_cli_v1`
- trace provenance: `model`
- requested CLI model: `gpt-5.6-sol`
- exact model identity: not reported by this trace
- validated length: 144 English words
- title: **At the Hearth**
- creator verdict: **reject** — structurally legible, but analytical,
  translation-like, and below demo-quality prose

> Penelope keeps the late interview beside the hearth. The stranger remains before her, wary and exact in his testimony, yet no precision is enough to turn her grief or hope into certainty. Every detail still asks to be tested. Eurycleia attends nearby, elderly and burdened with long memory of the household’s absent master.
>
> The fire makes the exchange intimate, but not private. Servants may enter; words may carry. Melantho is close enough to become a risk, and Penelope remembers the open abuse she heard during this interview and the rebuke she gave in answer. In this occupied, strained household, unusual conduct or overheard speech can endanger those involved. Penelope holds the moment there: the stranger waiting, Eurycleia attending, Melantho within dangerous reach of what might be said. She has not accepted the testimony, and she has not dismissed it. The next choice remains hers.

The runtime, not the narrator, supplied the three next actions: test the
testimony, order the foot washing, or observe without intervening.

## Creator decisions still required

### 1. Authored simulation proposals

These rules are executable preview candidates, not source facts:

- dismissal causes Melantho to investigate;
- waiting gives Melantho an opening to approach the hearth;
- visible, uncontained recognition lets Melantho compromise the plan;
- a private post-recognition confrontation permits controlled discovery;
- the controlled-discovery, compromised, and timeout ending thresholds.

The creator inspector lists them under `Creator review required`; source-derived
scar recognition, containment, testimony, and the contained ending remain
separately labeled `Source-grounded`.

### 2. Renderer contract replacement

The rejected prose renderer used four agent-proposed constraints:

1. close third-person limited to Penelope;
2. physical action and room objects instead of abstract explanation;
3. dialogue with subtext rather than rule exposition;
4. evidence may change suspicion without automatically becoming knowledge.

They are not accepted as a production writing contract. The creator approved a
replacement process: a separate prose-design pass defines a restrained English
narrative form. Codex fills it from already-resolved world state, and the creator
reviews the result before implementation is accepted. Action, observable reaction, and resulting
change are mandatory; dialogue is optional but should normally mark or cause a
turn when a speaking actor is present. The exact renderer contract and samples
remain candidate material until creator review.

### 3. Prose verdict — rejected

The creator rejected the opening. `Every detail still asks to be tested`
became report-like Korean (`모든 세부 사항은 아직 검증되어야 한다`) and exposed
that the narrator was translating epistemic state into analytical commentary.
Other failures include abstract certainty language, vague spatial risk,
characters functioning as pressure devices, and the interactive-fiction
handoff `The next choice remains hers`.

The sample must not be used as positive writing-quality evidence. The world
structure remains accepted as an implementation candidate; the renderer
contract and prose remain rejected pending the renderer-contract commission and
creator review.

The prepared deterministic fixture will remain visible for reviewer access,
but it must use the same accepted writing form as live output and be labeled as
offline/prepared evidence. It cannot prove arbitrary Codex generation or a live
GPT-5.6 result.

## Honest boundary

- Narration is a draft expression layer. Typed world state and causal receipts
  are authoritative.
- Generated prose is not reused as next-turn fact memory; continuity memory is
  rebuilt from registered focal-visible events.
- Grounding IDs prove that cited IDs were available, not that every clause is a
  formal semantic entailment of those IDs.
- The hidden-identity guard catches registered phrases and bounded equivalence
  patterns, but it is not a proof against every possible paraphrase.
- Creator/participant projections use separate local endpoints and an ephemeral
  capability. This is same-user workbench separation, not account
  authentication.
- Checkpoints are process-local, capped at 64, and expire after 30 minutes.

## Review path

Run `npm run dev`, open `/world`, keep **Deterministic fixture** selected, and:

1. choose **Order the foot washing**;
2. return to that checkpoint and enable **Fork as IF branch**;
3. compare **Observe without intervening** with **Ask Eurycleia to answer privately**;
4. open **Creator inspector** to compare private knowledge, rule provenance,
   clocks, event visibility, and receipt ancestry.
