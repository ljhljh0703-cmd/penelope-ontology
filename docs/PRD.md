# Product requirements

## Positioning

Track: Work & Productivity.

Audience: writers, narrative designers, and online tabletop game masters working with a bounded canon.

Job to be done: generate or revise a scene without silently introducing unsupported facts, leaking character-only knowledge, collapsing conflicting source traditions, or treating an idea as approved canon.

## Problem

RAG can retrieve relevant text and a model can still produce a polished contradiction. The costly step is not drafting alone; it is repeatedly checking who is alive, where an event belongs, what a character can know, which tradition is active, and whether a new idea has actually been approved.

## Product hypothesis

If generation exposes claim IDs and proposed state changes, deterministic code can catch a useful class of continuity failures before they enter canon. Creator approval can then separate “interesting suggestion” from “official world state,” and replay can show whether a canon update breaks prior cases.

This is a testable hypothesis, not a claim that the product guarantees coherent or good stories.

## Core workflow

1. The creator selects a World Pack, canon profile, fixed state, and focal characters.
2. Deterministic retrieval returns only active, relevant entities, claims, events, rules, and character knowledge.
3. GPT-5.6 returns prose and a strict structured account of what it asserted and changed.
4. Hard validators check entity existence, state, timeline, location, knowledge, active traditions, support, and expansion approval.
5. A passed draft can receive a soft review for plausibility and characterization. Soft review cannot change canon.
6. New lore is isolated as a proposal. The creator accepts, edits, or rejects it against a specific base version.
7. An accepted patch creates a new overlay version. Frozen cases replay before the new version is presented as safe.

## MVP acceptance criteria

One web page must demonstrate all of the following with the same small World Pack:

- one grounded scene passes with visible evidence
- one dead/out-of-place character is blocked
- one character knowledge leak is blocked
- one new rule becomes a proposal rather than canon
- creator acceptance increments the canon version
- the accepted rule can be used on rerun
- frozen prior cases keep their expected outcomes
- the UI clearly distinguishes fixture and live GPT-5.6 runs

## Success measures

- unsupported claim rate
- ontology hard-violation rate
- knowledge leak rate
- timeline contradiction rate
- expansion accept/edit/reject counts
- replay regression count

Creative quality and fun require human judgment; they are not reduced to a single automatic score.

## Non-goals

- all of Greek mythology
- graph database or embeddings
- generic World Pack editor
- multiplayer collaboration
- TRPG vote aggregation
- long-running character simulation or memory
- model training, fine-tuning, or DPO
- multi-agent orchestration
- licensed D&D, Call of Cthulhu, or private story assets
