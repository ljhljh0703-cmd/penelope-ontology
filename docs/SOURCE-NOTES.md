# Demo source and rights notes

The repository stores short original fact summaries, not quotations from modern translations. Ancient underlying works and modern editions/translations are treated separately.

## Current source set

| Source | Use | Current gate |
|---|---|---|
| Iliad, Book 24 | Hector's death and completed funeral state | `SOURCE_VERIFY` exact locator and edition rights |
| Iliad, Book 3 | Homeric-layer Helen at Troy | `SOURCE_VERIFY` exact locator and edition rights |
| Odyssey, Book 1 | Odysseus on Ogygia and the Ithacan opening state | `SOURCE_VERIFY` Penelope's exact epistemic boundary |
| Euripides, Helen 566–596 | later-tragedy phantom/real-Helen conflict | page reached; `RIGHTS_VERIFY` edition expression |

The Perseus pages are bibliographic references only. No displayed translation sentence is redistributed.

All four URLs returned HTTP 200 on 2026-07-14. This verifies reachability only; it does not close the claim-level source or edition-rights gates.


## Required before public data freeze

- verify each claim against the cited work and narrow locator
- verify edition and translation rights in the jurisdictions relevant to publication
- normalize English and Korean transliterations separately if Korean UI copy is added
- retain both claims when traditions conflict; never merge them as a single historical fact
- label the red-sail return signal as original creator canon, not ancient mythology

## Safe expression policy

- original one-sentence summaries only
- no modern commentary, annotations, cover art, or illustrations
- no D&D, Call of Cthulhu, game, novel, or private-world material
- CSS, shapes, and text only for the demo interface
