# Penelope Ontology — frame system

## Camera contract

- Canvas: 1920 × 1080, 16:9, 30 fps.
- Safe area: 96 px minimum on every edge; 128 px for narration-critical copy.
- Readability: one primary claim per frame, at most two supporting lines.
- Every frame must remain understandable when animation is paused.
- Motion explains causality, memory, or world-line divergence. Decorative motion is prohibited.

## Visual thesis

Penelope is a literary workbench with a deterministic spine. Frames combine a dark rehearsal stage, parchment evidence cards, and thread-like causal lines. The visual language should feel authored and theatrical rather than like a generic SaaS dashboard.

## Tokens

| Role | Value |
|---|---|
| night | `#0d1518` |
| night raised | `#162125` |
| parchment | `#f3efe5` |
| parchment dim | `#d9cfbe` |
| coral consequence | `#f16d58` |
| green containment | `#62c982` |
| acid decision | `#d7ff45` |
| muted ink | `#7d8585` |
| serif | Georgia / Times New Roman |
| sans | Inter / Helvetica Neue / system sans |
| mono | Menlo / SFMono-Regular |

## Composition rules

1. Use at least four distinct postures: typographic void, evidence wall, causal stage, split world line, portability tableau, system map, final mark.
2. Do not use purple gradients, generic emoji, fake terminals, glassmorphism, or repeated three-card grids.
3. Character art and product captures are evidence-bearing assets, not background decoration. Keep faces and legible UI unobstructed.
4. Serif carries myth, scene, and consequence. Sans carries product claims. Mono carries state receipts.
5. Coral means cost, suspicion, or compromised state. Green means containment or preserved boundary. Acid is reserved for creator choice.

## Motion grammar

- Thread draw: reveals causal edges and branch lineage.
- Receipt snap: state changes enter one at a time after a choice.
- Curtain wipe: separates reader-facing prose from creator-visible state.
- World-pack carousel: swaps bounded worlds without morphing identities across packs.
- No wall-clock animation. All movement belongs to one paused GSAP timeline registered as `penelope-pitch`.
