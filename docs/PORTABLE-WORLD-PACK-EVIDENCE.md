# Portable World Pack evidence packet

Status: **implementation verified locally; exact release commit, public CI, deployment, and hosted smoke pending**

This packet is the claim authority for the portable-world addition. README, Devpost copy, video narration, and later portfolio copy may be weaker than these claims, never stronger.

## Claim ledger

```yaml
claims:
  - id: PWP-01
    text: Penelope runs story-specific behavior from a strict, versioned World Pack rather than inferring Odyssey rules from a scenario name.
    pointer: src/contracts/penelope-world-pack.ts; src/application/world-simulation-service.ts; app/api/world/session/route.ts
    evidence_status: measured
    verification: current
    attribution: led
    boundary: The pack is a prepared bounded contract, not automatic manuscript ingestion or a conversational world builder.

  - id: PWP-02
    text: The public selector contains two registered packs with different sources, casts, hidden premises, actions, reactions, and endings.
    pointer: src/adapters/world-packs/registry.ts; src/adapters/world-packs/odyssey-book19.ts; src/adapters/world-packs/oz-discovery.ts; tests/unit/world-pack-registry.test.ts; tests/unit/oz-world-pack.test.ts
    evidence_status: measured
    verification: current
    attribution: led
    boundary: Book 19 and Oz Chapter XV are short rehearsals, not complete simulations of either work.

  - id: PWP-03
    text: A schema-valid creator-owned JSON definition can be sealed with a canonical digest and opened when the complete session-start request is no larger than 262,144 UTF-8 bytes.
    pointer: src/contracts/world-api.ts; src/contracts/penelope-world-pack.ts; app/api/world/session/route.ts; tests/unit/world-pack-api-portability.test.ts
    evidence_status: measured
    verification: current
    attribution: led
    boundary: The route reads the request before enforcing the application limit. Imported content uses temporary server memory; it is not browser-only, encrypted, confidential, persistent, or added to the public registry.

  - id: PWP-04
    text: A checkpoint and its children retain one sealed pack ID, version, and digest and reject a pack switch, including when two packs reuse the same scenario ID.
    pointer: src/application/world-session-store.ts; tests/unit/creator-world-pack-import.test.ts; tests/unit/world-pack-api-portability.test.ts
    evidence_status: measured
    verification: current
    attribution: led
    boundary: This binding is enforced by the in-memory checkpoint store. The standalone simulation ledger does not independently carry the pack digest.

  - id: PWP-05
    text: The Oz and creator-import browser flows continue through the generic workbench without Odyssey character or location leakage.
    pointer: tests/browser/world-pack-portability.spec.ts; tests/unit/world-pack-api-portability.test.ts
    evidence_status: measured
    verification: current
    attribution: led
    boundary: These checks cover registered identifiers and visible scene text on the tested routes; they do not prove every future pack is semantically well authored.

  - id: PWP-06
    text: Human-readable hidden premise details are returned only through the creator-capability projection and are absent from participant prose and the participant session view.
    pointer: src/contracts/world-api.ts; src/application/world-simulation-service.ts; tests/unit/world-simulation-service.test.ts; tests/unit/world-api-routes.test.ts
    evidence_status: measured
    verification: current
    attribution: led
    boundary: The creator capability is not account authentication or a multi-user confidentiality system.

  - id: PWP-07
    text: The Lantern Ledger is a public-safe, creator-attested original starter definition that seals and reaches a declared ending through the generic runtime.
    pointer: examples/world-packs/creator-owned-starter.json; tests/unit/creator-owned-starter-world-pack.test.ts
    evidence_status: creator_attested_plus_measured_runtime
    verification: current
    attribution: led
    boundary: It is a compact technical and authoring sample, not practitioner evidence or a claim of literary quality.

  - id: PWP-08
    text: Declared NPC reactions may occur in another zone after a creator action.
    pointer: src/domain/world-runtime.ts; src/adapters/world-packs/odyssey-book19.ts; tests/unit/odyssey-world-simulation.test.ts
    evidence_status: measured
    verification: current
    attribution: led
    boundary: No idle scheduler, independent timetable execution, long-running agent society, or persistent NPC memory is implemented.
```

## Repo Truth Audit

| Surface | Before this change | Current authority |
|---|---|---|
| Product scope | README described Book 19 as the demo and `/world` as a Book 19 route. | Book 19 is the default causal proof; Oz and The Lantern Ledger prove the portable pack boundary. |
| Creator-owned worlds | No public import path or authoring sample. | Strict JSON import, server sealing, temporary retention notice, starter definition, and desktop/mobile browser coverage. |
| Creator hidden state | IDs and counts were visible, but the actual premise and meaning were not. | Creator-only curtain ledger exposes summary, meaning, grounding, approval state, and withholding reason; participant projection remains clean. |
| NPC behavior | Some UI wording could be read as autonomous scheduling. | Public copy says declared causal reaction; autonomous idle scheduling remains explicitly unimplemented. |

## Verification snapshot

- TypeScript: PASS
- ESLint: PASS
- Vitest: 103 files, 872 tests PASS
- evidence regeneration and verification: 7 files PASS
- privacy scan: 406 files PASS
- production build and trace privacy: PASS; 19 manifests and 2,525 traced files inspected
- production Chromium + mobile WebKit portability flow: 2/2 PASS
- full production browser suite: 40/40 PASS
- local `npm run verify`: PASS
- exact release commit, CI, deployed SHA, hosted smoke: pending external release actions

## Forbidden claim upgrades

Do not turn this packet into any of the following without new evidence:

- “upload any story and Penelope understands it”;
- “private/confidential manuscript storage”;
- “autonomous NPCs keep living while the creator is idle”;
- “persistent campaigns or collaborative worlds”;
- “all of *The Odyssey* or *Oz* is modeled”;
- “graph database,” “formal ontology,” or “embedding-powered retrieval”;
- creator outcome metrics, adoption evidence, or a human literary verdict.
