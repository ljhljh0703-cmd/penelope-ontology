# Devpost project description — evidence-gated draft

Do not publish this text until every bracketed evidence marker has been resolved.

## What it is

Narrative Ontology Harness is a Work & Productivity web tool for writers, narrative designers, and tabletop game masters. It helps them use AI inside a bounded fictional world without treating every plausible-sounding addition as canon.

## How it works

A typed World Pack records entities, atomic claims, source traditions, fixed events, character knowledge, and creator rules. Deterministic retrieval passes an evidence bundle to GPT-5.6, which returns prose plus structured assertions and proposed state changes. Hard validators check entity state, time, location, character knowledge, active traditions, and unsupported expansion. New lore remains a proposal until the creator accepts or edits it against a specific canon version; frozen cases then replay. `[EVIDENCE: vertical-slice, gpt56-integrated, replay-regression]`

## Demo

The demo uses two fixed moments from Greek mythology rather than an encyclopedia-sized world. It shows a grounded Ithacan scene, blocks a living Hector and a Penelope knowledge leak, preserves conflicting Helen traditions, and stages an original red-sail rule for creator approval. `[EVIDENCE: demo-cases]`

## Why Codex and GPT-5.6

Codex was used to design and implement the schemas, deterministic core, UI, tests, source-safe demo pack, and evidence artifacts. The creator retained product, scope, canon, and submission decisions. GPT-5.6 powers structured narrative drafting and a non-authoritative soft review; deterministic code owns the hard gate. `[EVIDENCE: clean-core-session, response-metadata]`

## Current prohibited wording

Do not say the product guarantees coherent worlds, improves productivity, is production-ready, has users, trains a model, or uses a graph database unless later evidence changes those facts.
