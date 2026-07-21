# World Pack authoring

Penelope's current portability boundary is a **prepared, bounded JSON World Pack**. A pack is not a prose dump. It declares the small part of a world that one rehearsal needs, the actions that may change it, and the conditions under which those changes earn a consequence.

The two complete references are:

- [`src/adapters/world-packs/odyssey-book19.ts`](../src/adapters/world-packs/odyssey-book19.ts) — the main Book 19 causal demonstration;
- [`src/adapters/world-packs/oz-discovery.ts`](../src/adapters/world-packs/oz-discovery.ts) — an independent Oz Chapter XV portability proof.

For a ready-to-import definition, use [`examples/world-packs/creator-owned-starter.json`](../examples/world-packs/creator-owned-starter.json). **The Lantern Ledger** is creator-attested original public-safe material, contains no `definitionDigest`, and reaches a declared ending through the generic runtime test.

The authoritative validators are [`src/contracts/penelope-world-pack.ts`](../src/contracts/penelope-world-pack.ts) and [`src/contracts/world-simulation.ts`](../src/contracts/world-simulation.ts).

## What belongs in a pack

| Section | Purpose |
|---|---|
| `provenance` | Names the source or creator-owned material, its rights basis, and whether the source was checked or creator-attested. |
| `presentation` | Supplies the public title, hook, bounded source introduction, guided creator move, and locale metadata. The current runtime accepts English only. |
| `creatorInput` | Defines A/B recommendation policies, the actions C may resolve to, tacit-knowledge questions, and unsupported mechanisms that require expansion review. |
| `identityPolicy` | Separates model-facing aliases and hidden knowledge from what a focal character may perceive. The creator is always allowed to inspect the hidden-state projection. |
| `renderPolicy` | Defines tense, point of view, registered render text, prohibited terms, and complete rendering coverage for actors, actions, reactions, and endings. |
| `scenario` | Declares the bounded cast, premises, zones, actions, reaction rules, flags, clocks, creator-approved IF rules, and terminal conditions. |

## Authoring order

1. **Choose one short dramatic unit.** The current engine supports one through six turns, not a whole novel or persistent campaign. Write down the decision the creator should be able to change and the consequences that could close the rehearsal.
2. **Separate source facts from creator IF rules.** A public-domain source needs a checked URL. Private creator material uses `creator_owned`, `creator_attested`, and a stable manuscript or world-bible locator without a public URL.
3. **Declare the focal character and small cast.** Give each actor a current zone, a desire, something they avoid, and an agenda state. A declared reaction may move an NPC offstage after an observed action; the current release does not run independent NPC schedules while the creator is idle.
4. **Register actions before prose.** Every focal action needs a legal actor, target shape, one-turn cost, world meaning, creator-facing vocabulary, and a current-turn consequence. C may only propose a registered action; it never silently becomes A or B.
5. **Make consequences executable.** Reaction rules and endings must refer to declared actions, premises, zones, flags, and clocks. Exactly one timeout ending closes the bounded rehearsal if no earlier ending fires.
6. **Cover the renderer.** Every actor, action, reaction, and ending needs registered render text. Hidden knowledge needs explicit forbidden patterns so it cannot enter focal narration as a fact.
7. **Validate by importing locally.** Open `/world`, choose the JSON file, confirm its title is labeled `Session private`, run at least one turn, and return to the prior checkpoint. A branch must retain the same pack ID, version, and digest.

## Import contract

The browser accepts the **definition without `definitionDigest`**. The server:

1. rejects the complete session-start JSON request when it exceeds 262,144 UTF-8 bytes; the request wrapper therefore leaves slightly less space for the pack definition itself;
2. validates the complete strict schema and all cross-references;
3. rejects an imported `packId` that collides with a registered public pack;
4. computes a canonical SHA-256 digest over every field that can affect simulation, creator input, presentation, identity, or rendering;
5. stores the sealed definition with the session checkpoint and prevents child branches from switching to another pack.

Registered packs and imported definitions are mutually exclusive in one start request. An imported pack is not added to the public registry and is not made canonical outside its session.

## Privacy boundary

“Session private” means **temporary server memory**, not browser-only storage or a confidential manuscript service.

- The definition is not persisted by the application and expires after 30 minutes or earlier eviction.
- The participant-facing response omits the pack's creator-input and render-policy bodies.
- The creator projection requires the session's creator capability, but this is not account authentication, encryption, or multi-user access control.
- Do not upload sensitive or unpublished intellectual property to the hosted demo. Run the repository locally when testing private work.

## Current limits

- JSON import, not a conversational world-pack builder;
- one bounded rehearsal, not long-term autonomous simulation;
- deterministic declared reactions after a creator action, not an idle NPC scheduler;
- no persistence, accounts, collaboration, graph database, embedding store, or automatic ingestion of an arbitrary manuscript;
- English is the only accepted runtime locale in this release. Korean, Japanese, and Chinese remain planned rendering lanes, not selectable pack claims.

These limits are deliberate submission boundaries, not claims that the same contract already solves every authoring workflow.
