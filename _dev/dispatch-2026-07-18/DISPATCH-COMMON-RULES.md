<!-- 전 dispatch 공통 계약 — 역할·정본·금지·RETURN 규격 (모든 lane dispatch가 이 파일을 승계) -->
# DISPATCH-COMMON-RULES — Penelope 100% (2026-07-18, v2)

v2(2026-07-18): 계약 정본 표기 candidate-2.1 → **candidate-2.2**(r5.1
발행·작가 승인 5필드 매핑 반영) + c22 receipt 등재. 사유: 이 파일이 개별
dispatch보다 우선하므로 계약 버전 사실은 여기가 항상 현행이어야 한다 —
W5 v3와의 권위 충돌(Codex 지적) 해소.

적용 대상: `DISPATCH-W0` 및 `DISPATCH-LANE-A..E`, `DISPATCH-W5`. 각 dispatch는
이 파일 전문을 승계한다. 충돌 시 개별 dispatch가 아니라 이 파일과 결재서류
(`DECISION-2026-07-18-penelope-100-plan.md`)가 우선한다.

## 역할과 권한

- Executor: **Codex** (구현 전담). 방향·결정·게이트 = creator(PM),
  품질 최종 판정 = 작가.
- Codex 세션 모델은 **GPT-5.6로 명시 설정**하고, 세션 종료마다 `/feedback`
  session ID를 gitignored `private-submission/`에 기록한다(D7 승인 경로).
  `/feedback` 값·개인 경로·크리덴셜은 tracked 파일에 절대 기록 금지.

## 계약 정본 (재설계 금지, 이식만)

`_dev/dispatch-2026-07-18/contracts/` 동봉본이 정본이다:
`PENELOPE-NARRATIVE-INPUT.schema.json`, `PENELOPE-SENTENCE-HARNESS.schema.json`,
`PENELOPE-ENGLISH-STYLE-PROFILE.schema.json` + 인스턴스,
`PENELOPE-NARRATIVE-OUTPUT.schema.json`(ModelNarrationOutput 루트),
`PENELOPE-NARRATIVE-PIPELINE-ENVELOPE.schema.json`(envelope 루트),
`PENELOPE-NARRATIVE-PREFLIGHT.schema.json`,
`PENELOPE-NARRATIVE-AUTHORITY-CONTRACT.json`(**candidate-2.2** — sha256
`f96adc89…`, AC/FC/TT 규칙 + severityMatrix 5필드 매핑),
`schema-behavior-tests.py`(T01–T24) + `VERIFICATION-RECEIPT-2026-07-17.txt`
+ **`VERIFICATION-RECEIPT-2026-07-18-c22.txt`(24/24 — candidate-2.2 정본
영수증)**.
계약 의미 변경이 필요하면 구현하지 말고 STOP 후 RETURN에 사유를 적는다.

## 불변 원칙

1. **한 파일 한 owner** — 자기 lane 소유 파일만 수정. 타 lane 파일 필요 시
   인터페이스 요청만 RETURN에 기록.
2. 계약·테스트 먼저 고정, 구현은 그 다음.
3. 같은 실패를 새 가설 없이 반복하지 않는다. 실패 시 1회 수리 후 STOP·보고.
4. 테스트 숫자 늘리기보다 사용자에게 보이는 이야기 결과물 우선.
5. 검증 불가한 의미 판단을 결정론이라 표기 금지 — `heuristic` 또는
   `creator_review`로 정직 분류.
6. 생성 산문은 다음 턴 사실 저장소로 재수입 금지. continuity = typed
   event/state에서만 복원.
7. creator approval을 자동 PASS로 대체 금지. `natural/immersive/literary/
   characterful`류 판정은 작가 전용.

## 금지 (결재서류 §7 전문 승계)

새 graph DB·embedding / 원격 다중 사용자 서버 / 장기 자율 시뮬레이션 /
범용 에디터 / 새 세계관 / Quest Generator 전면 개발 / 테스트 숫자용 안전성
작업 / 실원고 없는 문체 개선 주장 / 무통제 모델 우열 주장 / fixture의
GPT-5.6 실생성 표기 / 미사용 기능의 구현 완료 기재 / private Vault·대화·원고
반입. 기존 라이브러리·검증 패턴 재활용 우선, 이름만 바꾼 재구현 금지.

**D7 표기 제약(확정)**: Responses API trace 없음. 모든 공개 표면(README·
영상·Devpost·데모)에서 산문 생성 모델 신원은 "requested `gpt-5.6-sol`,
actual identity unreported" 형식만 허용. GPT-5.6 기여 주장은 "Codex(GPT-5.6
지정) 구현 + /feedback ID" 범위로 한정.

## RETURN 규격 (각 lane, 작게)

```text
RETURN-<lane>-<date>.md
- 변경 파일 목록 (소유권 내 확인)
- 실행한 테스트·게이트와 결과 수치
- 커밋 SHA (커밋 시) / 미커밋 명시
- 미해결·STOP 사항
- /feedback ID 기록 위치 확인 (값 자체는 쓰지 않음)
```

git stage/commit은 Codex 로컬 세션에서만 실행한다(Cowork 마운트 경유 git
쓰기 금지 — index.lock EPERM 확인됨).
