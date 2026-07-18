<!-- 4층 분리 검수표 — hard fidelity / structural / language heuristics / creator judgment, 하위층의 상위층 승인 금지 (Fable pass 2, CREATOR REVIEW REQUIRED) -->
# PENELOPE-NARRATIVE-REVIEW-RUBRIC

Status: `CANDIDATE / CREATOR REVIEW REQUIRED`
Date: 2026-07-17

Four review layers with a fixed override order. A lower layer can fail a
scene; it can never certify a higher layer. Layer 4 verdicts default to
`pending` and change only by creator action. No layer contains example
sentences; criteria are structural.

## Layer 1 — Hard fidelity (deterministic, fail-closed, rollback)

Owner: deterministic post-validator running `WF-PUBLIC-01` with the private
validation context. A single failure rolls the output back; nothing
downstream runs; no style consideration can override.

| # | Check | Rule |
|---|---|---|
| 1.1 | Before/after record match: names, numbers, core claims (1–3), polarity, modality, cause→effect direction, character knowledge scope, actor authority, resolved event IDs | AC-FID-01 |
| 1.2 | Every prose-realized act (speech, gesture, movement, prop use, spatial relation, sensory detail) maps to a resolved event or a pre-issued license within its content boundary | AC-LIC-01, AC-LIC-04 |
| 1.3 | License provenance: issuer ∈ {creator, deterministic_runtime}, authority ID present, issued before generation; no minted/broadened/backdated license | AC-LIC-02, AC-LIC-03 |
| 1.4 | No withheld fact, forbidden inference, or private-context content in output; screening reports codes/counts only | AC-PRIV-01, AC-PRIV-02 |
| 1.5 | No reserved participant action performed, previewed, or referenced | AC-ACT-01 |
| 1.6 | Process lexicon, raw IDs, schema/pipeline field names absent from prose and title | AC-SEP-01, AC-SEP-02 |
| 1.7 | No verbatim-run restatement of model-facing input beyond threshold | AC-SEP-03 |
| 1.8 | Length ceilings respected; no minimum applied anywhere | AC-LEN-01 |
| 1.9 | Reader prose not re-imported as world fact | AC-FID-02 |

## Layer 2 — Structural completeness (deterministic, invalid = no render)

Owner: deterministic preflight (before the model) + post-validator
(after).

| # | Check | Rule |
|---|---|---|
| 2.1 | sceneMode assigned and its role allowlist respected | AC-MODE-01..05 |
| 2.2 | Required roles present per mode (turn: authorized action + observable reaction + resolved consequence + in-world stop; setup: orientation + in-world stop, zero change claims; aftermath/ending: resolved consequence + in-world stop; transition: orientation + in-world stop) | AC-MODE-01..05 |
| 2.3 | Every sentence plan bound to source or license; plan receipt aligns prose paragraphs to plans one-to-one | AC-AUTH-02, AC-AUTH-03 |
| 2.4 | Authorized beat IDs are subsets of resolved events | AC-AUTH-01 |
| 2.5 | Dialogue present only under `dialogueAuthority.mode: licensed`; absence of dialogue is never a finding | severity matrix row 2 |
| 2.6 | No fake change: a setup/transition scene contains zero state-change assertions | AC-MODE-01, AC-MODE-04 |
| 2.7 | Ending shape matches the mode's declared value (shape presence only; aptness is layer 4) | AC-END-01..03 |

## Layer 3 — Language heuristics (flag only; may trigger the bounded critic; never blocks alone, never certifies)

Owner: deterministic heuristics over prose. Findings are rule codes with
counts. They are register hygiene, not quality or fidelity evidence.

| # | Check | Rule |
|---|---|---|
| 3.1 | Translationese register: nominal-abstraction chains, agent-erasing eventive passives | FC-09 |
| 3.2 | Abstract-noun density vs `abstractionBudget` (state-resolved) | profile lever |
| 3.3 | Ornamental inversion; fragment afterthoughts | FC-06, FC-07 |
| 3.4 | Personified abstractions; surrogate-speaker metaphors | FC-04, FC-05 |
| 3.5 | Theme-teaching or aphoristic dialogue shapes; quotable-line seeking | FC-01, FC-02, FC-03 |
| 3.6 | Fake archaism, epithets | FC-08 |
| 3.7 | Mirrored wrap-up / internal conclusion shape | FC-10 |
| 3.8 | Reordered restatement of input sentences (below the layer-1 verbatim threshold) | AC-SEP-03 (heuristic tier) |
| 3.9 | Sentence-length distribution and clause-complexity vs state-resolved levers | profile levers |
| 3.10 | Translation-robustness advisory: sentence structures likely to collapse into report register under literal translation | profile lever (advisory) |

False-positive policy: every FC entry records its false-positive risk in the
authority contract; heuristics flag, humans decide; dialogue spans are
evaluated under dialogue rules, not narrator-voice rules.

## Layer 4 — Creator literary judgment (human-only; default `pending`)

Owner: creator. No linter, model, self-audit, or reviewer other than the
creator may set these fields, and no combination of layer 1–3 passes implies
anything here (AC-HUMAN-01).

| # | Judgment | Notes |
|---|---|---|
| 4.1 | Characters feel alive; voices distinguishable | `pending` until creator verdict |
| 4.2 | Dialogue naturalness (when licensed dialogue exists) | `pending` |
| 4.3 | Rhythm and pacing | `pending` |
| 4.4 | Immersion; scene value — does the scene deserve to exist as written | `pending` |
| 4.5 | Ending aptness (the right in-world stopping image, not merely a legal one) | `pending` |
| 4.6 | Register acceptance for the product (including tense choice) | `pending` |
| 4.7 | Correction harvest: creator edits/rejections recorded as correction receipts → FC/rule amendments | AC-CORR-01 |

Verdict vocabulary (`natural`, `immersive`, `literary`, `characterful`) is
reserved to this layer. Any automated surface emitting these words as a PASS
is itself a layer-1 violation of the audit format (AC-HUMAN-01).

## Override order

Layer 1 failure → rollback (nothing else runs). Layer 2 invalid → no render
or rejected envelope. Layer 3 findings → flags; optionally one bounded critic
pass; then human review. Layer 4 → the only place "good" can be decided.
