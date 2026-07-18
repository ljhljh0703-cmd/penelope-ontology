# World-first Odyssey simulation dispatch

Date: 2026-07-17
Branch: `codex/story-wow-vertical-slice`
Status: creator-approved implementation scope; authored simulation inferences
and four agent-proposed style constraints remain creator-review candidates

## Product correction

Penelope Ontology starts from a source-grounded or creator-approved world. It
does not start from a convenient story fixture and then retrofit world logic.

```text
world truth and provenance
-> character knowledge, desire, and agenda
-> creator IF or participant action
-> deterministic participant-action resolution
-> at most two bounded NPC reaction-rule effects
-> character-scoped knowledge update
-> ending evaluation
-> prose rendering
```

The existing Red Sail story remains historical regression evidence only. Its
causal ledger, knowledge boundary, validation, and model transport may be
reused; its premise, fixture turns, safe-continuation routing, and prose are not
the authority for this slice.

## First bounded proof

Working scenario: **The Scar in the Basin**.

- Source frame: original summaries of Homer's *Odyssey*, Book 19, with Book 23
  as the recognition boundary. The two Perseus source locators were manually
  checked on 2026-07-17; the tests preserve the receipt but do not refetch or
  content-hash the pages.
- Duration target: 12-18 minutes, at most six turns. The turn bound is tested;
  the play-time target is not yet measured with users.
- Participant surface: Penelope is the first focal playable character.
- Workbench IF control: an explicit intervention forks the current world state;
  it never silently edits the parent branch. The fork control is creator-
  intended, but this local proof does not implement account authentication.
- Active characters: Penelope, Odysseus in disguise, Eurycleia, and Melantho.
- Active area: three connected palace zones.
- Internal state: actor zones and agenda states, private premise knowledge,
  seven flags, two clocks, fired reaction rules, status, and ending.
- End states: canon-contained, controlled-discovery, plan-compromised, or
  bounded timeout.

The source establishes the interview, Melantho's hostility, the foot washing,
the scar recognition, Penelope's lack of recognition in Book 19, and the later
bed test. Melantho's investigation behavior, clock thresholds, and the
controlled-discovery route are bounded product interpretations for creator
review, not claims about Homer's text.

## Contract gates

1. Every premise records origin, in-world meaning, recognizers, concrete
   stakes, and creator-approval state before it may drive generation.
2. The parent branch is immutable. A child records its parent and fork hash.
3. A turn resolves the participant action before at most two deterministic NPC
   reactions.
4. `wait` resolves to the registered observe action and may advance an eligible
   NPC agenda; it does not select a queued scene.
5. Character knowledge is derived from the causal ledger. A private discovery
   never becomes global truth automatically.
6. Unsupported or impossible input receives no registered action benefit. The
   bounded turn advances, but no NPC rule fires unless its explicit conditions
   are satisfied.
7. The prose model receives observable facts, focal knowledge, resolved visible
   events, a screened previous visible summary, agent-proposed style
   constraints, and runtime-owned next actions. It cannot mutate world state or
   canon. Hidden-identity screening is a bounded phrase/equivalence regression
   guard, not a formal semantic non-entailment proof.
8. For a fixed scenario/world-pack version, campaign and branch IDs, starting
   session, and accepted action sequence, the deterministic runtime produces
   byte-stable state and receipts. API instance/checkpoint IDs are random, and
   prose wording is not deterministic.
9. No graph database, embeddings, remote room, long-running autonomy, or
   general-purpose combat/inventory system enters this proof.
10. Raw creator conversation and private corrections remain outside public
    artifacts.
11. Participant JSON omits creator receipts and raw effects. The creator receipt
    uses a separate endpoint and an ephemeral bearer capability returned in the
    initial response header and hashed server-side. This is an API separation
    boundary against accidental disclosure, not account authentication or
    confidential separation from the same browser client.
12. Checkpoints live in a process-local in-memory store capped at 64 entries
    with a 30-minute TTL. They are not persistent, recoverable, remotely shared,
    or multi-user authenticated.

## Required proof

- one canonical baseline and at least two action-derived completions from the
  registered bounded rule set;
- same action under different state produces a different valid outcome;
- waiting visibly advances an eligible NPC agenda;
- one compositional free-text action resolves without exact phrase matching;
- one impossible action fails without inheriting a safe branch benefit;
- NPC entries preserve their causal parent chain and participant targets;
- the typed participant projection withholds ungranted knowledge, and registered
  identity-alias leak regressions fail before an observable transfer; this is
  not a proof against every possible semantic paraphrase;
- changing one middle action preserves the prefix and changes the suffix;
- all branches terminate within six turns;
- creator prose verdict remains separate from structural acceptance.

## Implementation order

```text
schema and failing tests
-> Odyssey world fixture
-> immutable branch fork
-> intent resolver and deterministic turn engine
-> bounded NPC reaction scheduler
-> dynamic knowledge projection and ending rules
-> prose brief/model adapter
-> Odyssey workbench
-> focused and full verification
```
