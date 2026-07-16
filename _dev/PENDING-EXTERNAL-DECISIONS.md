# Pending external decisions

This memo isolates choices that cannot be completed honestly from repository evidence alone. It contains no credentials, private session IDs, or unpublished narrative assets.

## Recommended approvals

The final product name is no longer pending: the creator approved **Penelope Ontology** on 2026-07-15. Keep that exact name across public surfaces; the technical repository slug does not need to change.

1. **Root README pipeline refresh** — the approved writing pipeline currently reports `SERVING_STALE`. Refresh its authority hashes before generating README copy; do not bypass it with candidate mode or draft from memory.
2. **Public repository and hosted fixture** — recommend a public GitHub repository after the README exists and the current tree receives a clean exact-SHA recertification, then a provider deployment whose `/api/health` commit matches public HEAD. Approval phrase: `공개 GitHub와 배포 승인`.
3. **Narration source** — Build Week allows recorded or AI narration. Recommend English AI narration for speed and consistent timing unless the creator wants their own voice as a stronger authorship signal. Decision phrase: `AI 내레이션` or `직접 녹음`.

## Required external inputs

- Keep `private-submission/submission-record.json` aligned with `docs/submission/SUBMISSION-RECORD.example.json`. Change a nullable field or `false` flag only after its evidence exists; never commit this record.
- The creator reports receiving $100 in Build Week Codex credits. This confirms Codex availability, not API-platform billing or key applicability. The current Responses API live-evidence gate still requires separately authorized API access; any Codex CLI adapter is a different runtime/model claim and must be labeled and verified separately. Never paste credentials into chat.
- Run `/feedback` in the core Codex task and enter the resulting Codex session UUID only in the private submission record and Devpost field; labels and placeholder tokens fail closed.
- Upload the final narrated product demo publicly to YouTube and provide the URL for duration and claim-parity verification. Confirm in the private record that it demonstrates the product and explains both Codex and GPT-5.6 use; narration alone is insufficient.
- Confirm the Devpost category field itself is set to **Work & Productivity**; the repository records the intended track but cannot prove the final form value.
- Confirm Devpost shows the final submission state rather than only the in-progress project page. Set `submissionReadbackMethod` and the nested readback fields only after authenticated owner or Devpost-plugin review confirms exact name, Work & Productivity track, final-description SHA-256, repository, hosted demo, and video parity.

Run `npm run submission:check` before pressing Submit. After Devpost confirms submission, record its private receipt and run `npm run submission:check:post`. A BLOCKED result is authoritative; do not manually override it by editing a checklist.

## Not approval-dependent, but evidence-dependent

- “Arbitrary facilitator intents produced this scene” requires a sanitized live run.
- The separate ChatGPT-authenticated Codex CLI adapter was implemented and exhausted its primary plus fixed retry authorities without producing accepted live evidence. Do not rerun or relabel either attempt. A future CLI attempt requires a new explicit authority contract; the Responses API path remains a distinct evidence route with separate access requirements.
- A measured writing-control claim requires changing tracked `docs/submission/CLAIM-CONTRACT.json` in the final source commit and completing the preregistered four-call same-model capture plus creator ratings. A private flag alone has no authority. The receipt-only intermediate state intentionally fails the public evidence gate until its matching report is finalized.
- Productivity, practitioner adoption, quest automation, and production-readiness claims require separate future evidence.
