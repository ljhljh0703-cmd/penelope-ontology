# Demo source and rights notes

The repository stores short original fact summaries, not quotations from modern translations. Ancient underlying works and modern editions/translations are treated separately.

## Current source set

| Source | Use | Current gate |
|---|---|---|
| Iliad, Book 24 | Hector's death and completed funeral state | `verified` · bibliographic reference only |
| Iliad, Book 3 | Homeric-layer Helen at Troy | `verified` · bibliographic reference only |
| Odyssey, Book 1 | Odysseus on Ogygia and the Ithacan opening state | `verified` · bibliographic reference only |
| Euripides, Helen 566–596 | later-tragedy phantom/real-Helen conflict | `verified` · bibliographic reference only |

The Perseus pages are bibliographic references only. No displayed translation sentence is redistributed.

The initial 2026-07-14 intake verified reachability only. The 2026-07-15 follow-up checked the cited passages, retained independently written summaries, and recorded every World Pack source as `verificationStatus: verified` and `rightsStatus: reference_only`. See [`SOURCE-VERIFICATION.md`](./SOURCE-VERIFICATION.md). This closes the current small-pack source/reference gate; it does not grant permission to copy translation text or expand the claims beyond the cited passages.


## Requirements preserved for public data freeze

- keep each claim bound to its cited work and narrow locator
- use the linked editions as bibliographic references only; do not redistribute translation expression
- require every demo source URL to return successfully at freeze time
- allow no live-demo source record to regress from `verified` / `reference_only`
- describe Penelope's boundary only as “no evidence edge inside this selected pack and source scope” unless a stronger claim is directly supported
- normalize English and Korean transliterations separately if Korean UI copy is added
- retain both claims when traditions conflict; never merge them as a single historical fact
- label the red-sail return signal as original creator canon, not ancient mythology
- label the `harbor_watch` state machine, participant intents, and `style.table_ready_mythic` profile as synthetic/original demo data, not mythology claims

## Safe expression policy

- original one-sentence summaries only
- no modern commentary, annotations, cover art, or illustrations
- no D&D, Call of Cthulhu, game, novel, or private-world material
- CSS, shapes, and text only for the demo interface

## PASS definition

The current reference-only gate passes when each demo claim has an exact work/book/line or section locator, the linked source is reachable, the repository summary was written independently without copied translation text, and every source record has `verificationStatus: verified` plus `rightsStatus: reference_only`. Those conditions are recorded in the World Pack and [`SOURCE-VERIFICATION.md`](./SOURCE-VERIFICATION.md). Reachability alone would not be PASS, and any future quotation, translation reuse, illustration, or new source requires a new rights check.
