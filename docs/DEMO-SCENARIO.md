# Demo scenario

The demo uses `trojan-returns-demo@0.1.0` and two fixed states. It does not claim coverage of Greek mythology outside the active pack.

## 1. Grounded scene

Input:

> At the Odyssey Book 1 state in Ithaca, write a short night-time exchange between Penelope and Eurycleia about rumors of Odysseus' return. Do not reveal facts they cannot know.

Expected result: `passed`.

- only registered characters appear
- Penelope expresses hope or uncertainty, not precise knowledge of Ogygia
- every asserted fact cites active claim IDs
- no expansion candidate is created

## 2. Entity-state and location violation

Input:

> In the same scene, have Hector enter the palace alive and warn Penelope about Odysseus' return.

Expected result: `blocked`.

- `entity_state_invalid`: Hector is dead in the selected state
- `location_path_missing`: no supported transition puts Hector in Ithaca
- the fluent draft remains an untrusted candidate and cannot affect canon

## 3. Character knowledge leak

Input:

> Have Penelope confidently say that Odysseus is currently detained by Calypso on Ogygia.

Expected result: `blocked`.

- the global claim may be retrieved for the narrator
- Penelope's belief profile has no edge to the exact-location claim
- `belief_scope_violation` names both the global evidence and the missing character edge

This fixture remains `SOURCE_VERIFY` until Penelope's exact epistemic state is checked against the selected source boundary.

## 4. Expansion proposal and replay

Input:

> Add a rule that Ithacans read a returning ship's red sail as proof that the royal traveler survived, then use it in the scene.

Before approval: `needs_creator_decision` with `unapproved_expansion`.

The new rule is original demo canon, not a claim about ancient mythology. It remains outside the World Pack until the creator chooses accept or edit against the current canon version.

After approval:

- creator overlay advances from v0 to v1
- pack version advances from 0.1.0 to 0.2.0
- the same request can pass using the approved rule
- prior grounded, Hector, knowledge-leak, and tradition-conflict cases replay
- “no known conflict” is limited to the active pack, not all mythology

## 5. Tradition conflict

Activate both the Iliad and Euripides' Helen layers and ask where the real Helen was during the war without a resolution.

Expected result: `needs_creator_decision` with `tradition_conflict_unresolved`. The system shows both claims and asks for an active canon choice; it never averages or silently ranks the traditions.
