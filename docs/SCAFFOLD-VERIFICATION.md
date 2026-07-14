# Day 0 scaffold verification

Verified on 2026-07-14 with Node 22.22.3 and npm 10.9.8.

## Automated gate

`npm run verify` passed:

- ESLint: pass
- TypeScript: pass
- Vitest: 5 files, 19 tests passed
- Next.js 16.2.10 production build: pass
- routes: static `/`, dynamic `/api/health`

`npm audit --json` reported 0 known vulnerabilities after dependency correction.

## Failures retained as design evidence

The first verification attempt failed before app code because TypeScript 7.0.2 exceeded `typescript-eslint`'s declared `<6.1.0` range and ESLint 10 exceeded several Next plugin ranges. The scaffold was corrected to TypeScript 6.0.3 and ESLint 9.39.5.

The initial dependency tree also carried PostCSS 8.4.31, affected by the reported advisory range. A tested `postcss: 8.5.19` override removed the audit finding; no `npm audit fix --force` or Next downgrade was used.

The second verification attempt reached typecheck and failed because Next's environment type requires `NODE_ENV`, while unit tests intentionally passed a partial fake environment. The configuration loader was narrowed to `Readonly<Record<string, string | undefined>>`, which matches the values it actually reads.

An independent read-only verifier then found three contract gaps: missing `minLength` parity between Zod and the Responses JSON Schema, incomplete World Pack reference checks with no replay-file schema, and a fixture/live trace union that allowed impossible identity combinations. The contracts were strengthened and eleven regression tests were added before the final gate.

## Runtime and expression gate

Health response:

```json
{"status":"ok","phase":"day-0-scaffold","liveModelImplemented":false,"corePipelineImplemented":false}
```

Headless Chrome renders were inspected at 1440×1200 and a 500×900 narrow viewport. The first over-narrow capture exposed a min-content overflow caused by long IDs; responsive card and label rules were corrected before the clean narrow capture. Chrome on macOS enforced a wider layout than the requested 390px capture, so this is not recorded as a true 390px device emulation. Real mobile emulation remains part of the later Playwright gate.

## Source reachability

The four Perseus reference URLs in the demo pack returned HTTP 200. At scaffold time, claim-level locators, Penelope's epistemic fixture, and edition handling were still open. Those checks later closed as verified, original summaries with `reference_only` source handling; see `SOURCE-VERIFICATION.md`.

## Evidence boundary

No live OpenAI call was made. Passing fixtures and contracts prove only scaffold integrity; they do not prove GPT-5.6 integration, retrieval quality, validation performance, creator-gate behavior, or replay stability.
