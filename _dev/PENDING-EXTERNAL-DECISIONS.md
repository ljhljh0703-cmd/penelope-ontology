# Pending external decisions

This memo isolates choices that cannot be completed honestly from repository evidence alone. It contains no credentials, private session IDs, or unpublished narrative assets.

## Recommended approvals

1. **Final product name** — recommend **Narrative Knowledge Harness**. The implemented UI, English narration, and problem framing already use it; it describes a rehearsal and control system without implying autonomous authorship or guaranteed consistency. Approval phrase: `이름 승인`.
2. **Root README candidate mode** — recommend approving an evidence-safe README now, while keeping GPT-5.6 live-use wording gated. The packaging preflight is `SERVING_CANDIDATE`, so Codex cannot run it without a narrow explicit approval. Approval phrase: `README 후보 모드 승인`.
3. **Public repository and hosted fixture** — recommend a public GitHub repository after the README exists, then a provider deployment whose `/api/health` commit matches public HEAD. Approval phrase: `공개 GitHub와 배포 승인`.
4. **Narration source** — Build Week allows recorded or AI narration. Recommend English AI narration for speed and consistent timing unless the creator wants their own voice as a stronger authorship signal. Decision phrase: `AI 내레이션` or `직접 녹음`.

## Required external inputs

- Create ignored `.env.local` with the GPT-5.6 API configuration, then report only `키 설정 완료`; never paste the key into chat.
- Run `/feedback` in the core Codex task and enter the resulting session ID only in the private submission record and Devpost field.
- Upload the final narrated video publicly to YouTube and provide the URL for duration and claim-parity verification.
- Confirm the Devpost category field itself is set to **Work & Productivity**; the repository records the intended track but cannot prove the final form value.
- Confirm Devpost shows the final submission state rather than only the in-progress project page.

## Not approval-dependent, but evidence-dependent

- “Arbitrary facilitator intents produced this scene” requires a sanitized live run.
- A measured writing-control claim requires the preregistered four-call same-model capture plus creator ratings.
- Productivity, practitioner adoption, quest automation, and production-readiness claims require separate future evidence.
