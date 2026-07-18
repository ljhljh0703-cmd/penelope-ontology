<!-- Wave 5 — 3장면 연쇄 실생성 + 블라인드 A/B + 작가 판정 세션 (Lane D 완료 후 투입) -->
# DISPATCH-W5-ab-session (v4 — 2026-07-18 수정, Codex 결함 지적 4건 반영)

승계: `DISPATCH-COMMON-RULES.md`(v2 — 정본 candidate-2.2). **발행 조건
충족(r5.3)**: Lane D 완료(HEAD `2bc6c8e` — 5경로 배선·migration guard 활성
전환, 작가 확인 2026-07-18) + D6 결재 완료. 실행 시점: 7/20 저녁.

**산출 위치(v4 수정)**:

- **raw 원본 전부**(프롬프트·산문·envelope·critic 수정본): gitignored
  **`private-submission/w5-ab/`** — `_dev/`는 gitignore되지 않으므로
  미승인 산문의 tracked 노출 금지.
- `_dev/dispatch-2026-07-18/ab-session/`에는 **공개 가능분만**: 마스킹된
  판정지·해시 매니페스트·RETURN. 산문 원문 반입 금지.

v4 변경분: ① 산출 위치 분리(위) ② A 기준선 소스 고정 + evaluation-only
runner 구현 명시 ③ 비교 규칙 수정(하네스별 자체 계약 · 최초 출력+critic
수정본 모두 보존 · 작가에겐 최종 제품만 블라인드) ④ 승계 표기
COMMON-RULES v2. v3: B = candidate-2.2 표기·baseline A = evaluation-only
runner. v2: correction receipt seed 질문 1문항(작가 승인 2026-07-18).

## 생성 단위 (D2 승인)

허가된 Odyssey 3장면 연쇄 × 3 입력 케이스:

```text
케이스 1: 정상 선택        (setup → turn → aftermath/ending)
케이스 2: 위험하지만 합리   (동일 연쇄, 다른 허가 분기)
케이스 3: 억지/저정보 입력  (no_render 또는 무이득 진행의 정직 처리 확인)
```

중앙 turn 장면 = 블라인드 A/B 대상.

## A/B 조건 (전부 필수)

- **A 기준선(v4 고정)** = 구형 renderer 프롬프트, 소스는
  **`e7ca346c:src/adapters/codex-cli/world-narrator.ts`로 pin**(현
  HEAD에서 +232/−113 재작성되어 구형 프롬프트는 이 커밋에만 존재).
  Codex가 이 pin 소스 기반 **evaluation-only runner를 구현**해 실행 —
  평가 전용 경로이며 production 배선 아님. migration guard가 production
  = 신 pipeline임을 강제하므로, A 실행이 guard·배선 상태를 건드리면 STOP.
- B = **candidate-2.2** 하네스(계약 정본 `f96adc89…` — repo
  `_dev/dispatch-2026-07-18/contracts/` 커밋본 기준), production과 동일한
  Pipeline B 경로.
- **동일 조건 = 입력·모델 조건만(v4 수정)**: world state·participant
  action·허가 facts/events·모델·reasoning 설정 동일. **output schema는
  하네스별 자체 계약을 따른다**(구형은 구 출력 형식, B는
  ModelNarrationOutput/envelope — "동일 output schema" 요구는 구·신 비교와
  양립 불가하므로 철회).
- **무편집 원칙(v4 재정의)**: 금지 대상 = **파이프라인 외부 개입**(재생성
  체리픽·수동 문구 수정·슬롯 간 짜깁기 — 위반 시 그 슬롯 폐기, 새 슬롯
  기록). B의 critic 1회 수정은 Pipeline B **내부** 규칙(warning 시에만,
  ≤1회, hard fail은 critic 없이 fail-closed)이므로 무편집 위반이 아니다.
  **최초 출력과 critic 수정본을 모두 보존**(각각 해시)하되, 작가 블라인드
  판정에는 **각 하네스의 최종 제품 결과만** 제시한다. critic 발동 여부는
  판정 후 공개.
- 순서 AB/BA 또는 무작위 마스킹, 라벨 은닉
- **D5**: 중앙 turn을 B 하네스에서 present/past 2벌 생성해 판정에 포함
  (호출 +2회)
- 모델 정보·조건은 작가 판정 **후** 공개
- 모든 프롬프트·출력(최초분+critic 수정본) 해시를 `_dev` 매니페스트에
  기록(재현성), raw 전량은 `private-submission/w5-ab/`(gitignore 실측
  확인됨 — `.gitignore`의 `private-submission/` 항목)

## 작가 판정지 (9항목, 각 1~5 + 한 줄 근거)

1. 한국어 번역투 없이 영어 원문 자체가 명료한가
2. 인물이 압력 장치가 아니라 자기 욕망을 가진 존재로 보이는가
3. 행동 → 반응 → 결과가 읽히는가
4. 선택의 책임이 다음 장면에 남는가
5. 세계관 정보가 보고서처럼 낭독되지 않는가
6. 대사가 국면을 바꾸는가
7. 다음 장면으로 자연스럽게 이어지는가
8. 불합리한 강제라고 느껴지지 않는가
9. 계속하고 싶은가

시제 선호(D5)를 별도 1문항으로 기록. **최종 품질 PASS 선언 = 작가만.**
자동 게이트 통과·lint clean은 판정지에 "구조 검증 통과"로만 표기하고 품질
근거로 제시하지 않는다.

## 실패 처리

작가 거절 시: 거절 사유를 correction receipt로 기록(AC-CORR-01) → 수정
1회(7/21 오전)만 → 재거절 시 데모 범위 축소 + 주장 범위 축소. 무한 수정
루프 금지.

**correction receipt 필수 1문항 (v2 추가 — 작가 승인 2026-07-18)**:

> "이 교정을 유발한 미명세 레버는 무엇인가?" — 작가 자유 기술 1줄.

용도: 차기 additive 개정(AC-CORR-01 flow)의 seed 질문. 영수증 **문서에만**
기록 — correctionIngestion 스키마 반영 아님(스키마는 additive_under_lock
`[creatorCorrectionReceiptId, ruleId, date]` 그대로, `additionalProperties:
false` 무변경).

## RETURN

`_dev/dispatch-2026-07-18/RETURN-W5.md` — 판정지(마스킹 유지분)·해시
매니페스트·승인/거절 결과·correction receipt 포함. **산문 원문·프롬프트
원문은 RETURN에 반입 금지** — `private-submission/w5-ab/` 경로 참조만
기재(COMMON-RULES의 private 자료 tracked 기록 금지 승계).
