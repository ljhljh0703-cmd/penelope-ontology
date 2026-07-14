# Devpost project description — pre-live evidence-safe draft

The prose below matches the current fixture evidence and is safe for the in-progress project page. Final submission remains blocked until one sanitized GPT-5.6 call is verified; do not add GPT-5.6 to the final Built with field before that gate passes.

## What it is

This project is a Work & Productivity web tool for professional GMs, narrative production teams, and game scene or quest designers. Writers working inside a bounded canon are an adjacent audience. It combines several participant intents inside a bounded fictional world and creator-owned style without treating every plausible-sounding addition as canon.

## How it works

A facilitator records participant intents separately from the fictional characters they control and selects an original style profile. A typed World Pack records entities, atomic claims, source traditions, fixed events, character knowledge, and creator rules. The implemented fixture path returns attributed prose, assertions, actions, and proposals through the same strict boundary used by the gated GPT-5.6 adapter. Deterministic validators check identity, state, time, location, knowledge, active traditions, and unsupported expansion. A derived canon/knowledge graph explains the result. Creator-approved changes alone enter the overlay; an edit may improve display wording but cannot silently alter or conceal the approved rule's meaning. Four run-only safety controls then replay against that exact overlay hash before a two-step finite-state simulation may advance. A real GPT-5.6 response has not yet been captured.

## Demo

The demo uses two fixed moments from Greek mythology rather than an encyclopedia-sized world. Two local participant intents become a restrained Ithacan scene candidate. The graph exposes character-knowledge boundaries and an original red-sail rule proposal. After creator approval, the server reruns four safety controls against that overlay; two validated steps then advance `harbor_watch` from `idle` to `watching` to `signal_seen`.

## Hardest problem

The difficult part was not producing a fluent paragraph. It was preventing a fluent paragraph from becoming false authority. A candidate could sound convincing while leaking narrator-only knowledge, collapsing two source traditions into one answer, or smuggling a useful invention into canon. Prompt instructions alone could not make those failures inspectable. I separated subjective taste from hard invariants, made every claim and action carry evidence and intent lineage, required a creator decision for expansion, and replayed frozen cases after state changed. The result is deliberately fail-closed: missing or conflicting information becomes a visible decision point, not an invented bridge.

## Why Codex and GPT-5.6

I treated a familiar skepticism—that Codex can be a strong engineering partner while its default prose may feel generic beside writing-first systems such as Fable or Opus—as a product constraint, not a benchmark result to argue away. A cherry-picked paragraph would not solve a production team's next scene. Instead, I used Codex to translate tacit standards—voice, canon, character knowledge, participant ownership, and world-state change—into explicit style, world, evidence, approval, and replay layers backed by schemas, deterministic code, UI, adversarial tests, and evidence artifacts. It turned vague feedback such as “this no longer sounds like our world” into typed, reproducible failure cases. I retained product direction, original style, canon, scope, subjective writing judgment, and submission decisions. The implemented GPT-5.6 adapter bounds future model output to structured candidates; deterministic code owns validation and transition. A preregistered same-model AB/BA path can test whether the style bundle changes registered controllability measures, while world fixtures already test unsupported facts, knowledge leaks, source conflicts, semantic edit attempts, and replay stability. These are implemented mechanisms and evaluation paths—not completed live-model results.

## Built with — current evidence-safe list

Codex, the OpenAI SDK Structured Outputs adapter, TypeScript, Next.js, React, Zod, Vitest, Playwright, and GitHub Actions. Add GPT-5.6 and the Responses API to the final Devpost Built with field only after the sanitized live gate passes.

## Current prohibited wording

Do not say the product guarantees coherent worlds, improves productivity, is production-ready, has users, trains a model, uses a graph database, supports actual remote multi-user play, performs generalized quest automation, or writes better than Fable, Opus, or another model unless later evidence changes those facts.
