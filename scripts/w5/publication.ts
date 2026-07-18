import type {
  W5PrivateCaptureResult,
  W5PrivateSessionPlan,
} from "@/scripts/w5/session";
import { canonicalJson } from "@/src/domain/canonical-json";
import { sha256Bytes } from "@/scripts/w5/recording-process-runner";

const sampleGroup = (callId: string): "pair-i" | "pair-ii" | "tense" =>
  callId.startsWith("call.normal.")
    ? "pair-i"
    : callId.startsWith("call.controlled.")
      ? "pair-ii"
      : "tense";

const sortedCommitments = (capture: W5PrivateCaptureResult) =>
  [...capture.samples]
    .sort(({ blindLabel: left }, { blindLabel: right }) =>
      left.localeCompare(right),
    )
    .map(({ blindLabel, finalOutputSha256 }) => ({
      blindLabel,
      finalOutputSha256,
    }));

export const buildW5PlanCommitment = (plan: W5PrivateSessionPlan) => ({
  schemaVersion: "w5.plan_commitment.v1" as const,
  sessionId: plan.sessionId,
  sourceRevision: plan.sourceRevision,
  scenarioSha256: plan.scenarioSha256,
  maskCommitmentSha256: plan.maskCommitmentSha256,
  modelCallsPlanned: plan.calls.length,
});

export const buildW5BlindCommitments = ({
  plan,
  capture,
  operationalEvidenceRootSha256,
}: {
  plan: W5PrivateSessionPlan;
  capture: W5PrivateCaptureResult;
  operationalEvidenceRootSha256: string;
}) => ({
  schemaVersion: "w5.blind_commitments.v1" as const,
  sessionId: plan.sessionId,
  sourceRevision: plan.sourceRevision,
  maskCommitmentSha256: plan.maskCommitmentSha256,
  operationalEvidenceRootSha256,
  samples: sortedCommitments(capture),
  structuralNoRender: {
    rendererCallCount: 0 as const,
    criticCallCount: 0 as const,
    noGain: true as const,
    timeAdvanced: true as const,
    recoverableEndingReached: true as const,
  },
});

export const buildW5BlindPacketMarkdown = (
  capture: W5PrivateCaptureResult,
): string => {
  const section = (
    group: ReturnType<typeof sampleGroup>,
    title: string,
  ): string => {
    const members = capture.samples
      .filter(({ callId }) => sampleGroup(callId) === group)
      .sort(({ blindLabel: left }, { blindLabel: right }) =>
        left.localeCompare(right),
      );
    return [
      `## ${title}`,
      ...members.flatMap((sample) => [
        `### ${sample.blindLabel}`,
        `Final JSON SHA-256: \`${sample.finalOutputSha256}\``,
        sample.finalProse,
      ]),
    ].join("\n\n");
  };
  return [
    "# W5 Blind Creator Review — Private",
    "조건 이름, 모델 정보, critic 발동 여부는 작가 판정 전까지 숨겨져 있습니다. 아래 텍스트는 각 슬롯의 최종 제품 결과이며 수동 수정하지 않았습니다.",
    section("pair-i", "Scene Pair I"),
    section("pair-ii", "Scene Pair II"),
    section("tense", "Tense Pair"),
    "## Structural case",
    "터무니없는 명령은 산문 생성 없이 시간이 1턴 진행되고 아무 이득도 주지 않았습니다. 이어진 허가 행동은 등록된 엔딩에 도달했습니다.",
  ].join("\n\n");
};

export const buildW5CreatorRatingSheetMarkdown = (
  capture: W5PrivateCaptureResult,
): string => {
  const commitments = sortedCommitments(capture);
  const hashes = new Map(
    commitments.map(({ blindLabel, finalOutputSha256 }) => [
      blindLabel,
      finalOutputSha256,
    ]),
  );
  const labelsByGroup = {
    "pair-i": capture.samples
      .filter(({ callId }) => sampleGroup(callId) === "pair-i")
      .map(({ blindLabel }) => blindLabel)
      .sort(),
    "pair-ii": capture.samples
      .filter(({ callId }) => sampleGroup(callId) === "pair-ii")
      .map(({ blindLabel }) => blindLabel)
      .sort(),
    tense: capture.samples
      .filter(({ callId }) => sampleGroup(callId) === "tense")
      .map(({ blindLabel }) => blindLabel)
      .sort(),
  };
  const criteria = [
    "영어 원문이 번역투 없이 명료한가",
    "인물이 자기 욕망을 가진 존재로 보이는가",
    "행동 → 반응 → 결과가 읽히는가",
    "선택의 책임이 다음 장면에 남는가",
    "세계관 정보가 보고서처럼 낭독되지 않는가",
    "대사가 국면을 바꾸는가",
    "다음 장면으로 자연스럽게 이어지는가",
    "불합리한 강제라고 느껴지지 않는가",
    "계속하고 싶은가",
  ];
  const sampleBlock = (label: string) => [
    `### ${label}`,
    `최종 JSON SHA-256: \`${hashes.get(label)}\``,
    "| # | 항목 | 점수(1–5) | 공개 가능한 한 줄 근거 |",
    "|---:|---|---:|---|",
    ...criteria.map(
      (criterion, index) => `| ${index + 1} | ${criterion} |  |  |`,
    ),
    "결정: accept / revise_once / reject",
  ].join("\n");
  const group = (title: string, labels: readonly string[]) => [
    `## ${title}`,
    ...labels.map(sampleBlock),
  ].join("\n\n");
  return [
    "# W5 Creator Rating Sheet",
    "산문은 비공개 블라인드 패킷에서 확인합니다. 이 파일에는 조건·모델·critic 정보와 산문 원문이 없습니다. 이 공개 양식은 해시로 고정되므로 직접 편집하지 않습니다.",
    "실제 점수와 근거는 capture 완료 시 함께 생성되는 gitignored creator-decision-draft JSON에 기록합니다.",
    "근거 칸에는 원문 인용·개인 경로·프롬프트를 넣지 말고, 공개해도 되는 평가 요약만 적습니다. 상세 메모는 비공개 결정 JSON의 rationale에, 공개 요약은 publicRationale에 기록합니다.",
    group("Scene Pair I", labelsByGroup["pair-i"]),
    group("Scene Pair II", labelsByGroup["pair-ii"]),
    group("Tense Pair", labelsByGroup.tense),
    "## 시제 선택",
    "Tense Pair 중 선호: sample-* 라벨 하나 / 차이 없음 — 조건 공개 전에는 present/past를 추정해 적지 않습니다.",
    "## 구조 검증",
    "억지 입력: renderer 0회 · critic 0회 · 이득 0 · 시간 진행 · 다음 허가 행동으로 엔딩 도달.",
    "최종 품질 PASS/수정/거절은 점수 자동계산이 아니라 작가가 직접 선언합니다.",
    "## Decision JSON 작성 규칙",
    "PASS라면 finalQualityDecision=pass, correctionReceipt=null로 둡니다.",
    "revise_once 또는 reject라면 correctionReceipt의 rejectionReason, unspecifiedLever, publicReasonSummary, publicUnspecifiedLeverSummary 네 필드를 모두 채웁니다.",
    "publicReasonSummary와 publicUnspecifiedLeverSummary는 공개 가능한 한 줄(각 240자 이하)로 쓰고, 원문 인용·개인 경로·마크다운 제어문자를 넣지 않습니다.",
  ].join("\n\n");
};

const textFileSha256 = (text: string): string =>
  sha256Bytes(Buffer.from(text.endsWith("\n") ? text : `${text}\n`, "utf8"));

const jsonFileSha256 = (value: unknown): string =>
  sha256Bytes(Buffer.from(`${canonicalJson(value)}\n`, "utf8"));

export const buildW5ReviewBundle = ({
  plan,
  capture,
  operationalEvidenceRootSha256,
}: {
  plan: W5PrivateSessionPlan;
  capture: W5PrivateCaptureResult;
  operationalEvidenceRootSha256: string;
}) => {
  const blindPacketMarkdown = buildW5BlindPacketMarkdown(capture);
  const blindCommitments = buildW5BlindCommitments({
    plan,
    capture,
    operationalEvidenceRootSha256,
  });
  const creatorRatingSheetMarkdown =
    buildW5CreatorRatingSheetMarkdown(capture);
  const componentHashes = {
    operationalEvidenceRootSha256,
    blindPacketSha256: textFileSha256(blindPacketMarkdown),
    blindCommitmentsSha256: jsonFileSha256(blindCommitments),
    creatorRatingSheetSha256: textFileSha256(creatorRatingSheetMarkdown),
  };
  return {
    blindPacketMarkdown,
    blindCommitments,
    creatorRatingSheetMarkdown,
    ...componentHashes,
    reviewBundleSha256: sha256Bytes(
      Buffer.from(canonicalJson(componentHashes), "utf8"),
    ),
  };
};

const W5_RATING_CRITERIA = [
  "clarity",
  "character_desire",
  "causal_legibility",
  "consequence_continuity",
  "no_report_register",
  "dialogue_turns_scene",
  "scene_continuity",
  "fair_consequence",
  "desire_to_continue",
] as const;

export const buildW5CreatorDecisionDraft = ({
  plan,
  capture,
  reviewBundleSha256,
}: {
  plan: W5PrivateSessionPlan;
  capture: W5PrivateCaptureResult;
  reviewBundleSha256: string;
}) => ({
  schemaVersion: "w5.creator_decision_packet.v2" as const,
  sessionId: plan.sessionId,
  reviewBundleSha256,
  sheets: [...capture.samples]
    .sort(({ blindLabel: left }, { blindLabel: right }) =>
      left.localeCompare(right),
    )
    .map(({ blindLabel }) => ({
      blindLabel,
      ratings: W5_RATING_CRITERIA.map((criterionId) => ({
        criterionId,
        score: null,
        rationale: "",
        publicRationale: "",
      })),
      tensePreference: null,
      creatorDecision: null,
    })),
  preferredTenseSample: null,
  finalQualityDecision: null,
  correctionReceipt: {
    rejectionReason: "",
    unspecifiedLever: "",
    publicReasonSummary: "",
    publicUnspecifiedLeverSummary: "",
  },
});
