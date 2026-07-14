# Demo source verification

Verified on 2026-07-15 KST. The demo stores original summaries and bibliographic locators only; it does not copy source translations into the World Pack.

| World Pack source | Locator | What the original summary uses | Link check |
|---|---|---|---|
| Homeric *Iliad* | Book 24 | Hector is dead and his funeral closes the fixed Trojan moment | HTTP 200 after retry; passage location confirmed |
| Homeric *Iliad* | Book 3 | The Homeric layer places Helen at Troy during the war | HTTP 200; passage location confirmed |
| Homeric *Odyssey* | Book 1 | The narration locates Odysseus with Calypso while Ithaca lacks exact knowledge of his return | HTTP 200 after retry; passage location confirmed |
| Euripides, *Helen* | Lines 566–596 | The later-tragedy layer distinguishes the real Helen from the phantom at Troy | HTTP 200; passage location confirmed |

The four URLs are stored in `data/world-packs/trojan-returns/world.json`. Availability checks establish that the locators resolve; they do not turn the small demo pack into comprehensive coverage of Greek mythology.
