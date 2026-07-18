import type {
  ModelNarrationOutput,
  PenelopeEnglishStyleProfile,
  PenelopeScenePlan,
} from "@/src/contracts/world-narrator";
import type { NarrationRuleFinding } from "@/src/domain/narration-preflight";

export const NARRATION_LINT_RULE_IDS = [
  "FC-01",
  "FC-02",
  "FC-03",
  "FC-04",
  "FC-05",
  "FC-06",
  "FC-07",
  "FC-08",
  "FC-09",
  "FC-10",
  "AC-END-02",
] as const;

export const NARRATION_FORBIDDEN_CONSTRUCTION_RULE_IDS =
  NARRATION_LINT_RULE_IDS.slice(0, 10) as ReadonlyArray<
    (typeof NARRATION_LINT_RULE_IDS)[number]
  >;

export type NarrationLintRuleId = (typeof NARRATION_LINT_RULE_IDS)[number];

export type NarrationLintFinding = NarrationRuleFinding<NarrationLintRuleId> & {
  classification: "heuristic";
  severity: "warning";
  blocking: false;
};

export type NarrationStyleMetrics = {
  paragraphCount: number;
  sentenceCount: number;
  wordCount: number;
  sentenceWords: ReadonlyArray<number>;
  medianSentenceWords: number;
  averageSentenceWords: number;
  shortSentenceShare: number;
  abstractNounCount: number;
  abstractNounDensity: number;
  passiveConstructionCount: number;
  passiveConstructionShare: number;
  dialogueLineCount: number;
  figurativeSignalCount: number;
};

export type NarrationLintInput = {
  modelOutput: ModelNarrationOutput;
  scenePlan: PenelopeScenePlan;
  styleProfile: PenelopeEnglishStyleProfile;
  styleStateId: string;
};

export type NarrationLintResult = {
  findings: ReadonlyArray<NarrationLintFinding>;
  metrics: NarrationStyleMetrics;
  warningCount: number;
  criticRecommended: boolean;
  blocking: false;
};

const normalizeText = (text: string): string =>
  text
    .toLocaleLowerCase("en-US")
    .replace(/[“”]/gu, '"')
    .replace(/[‘’]/gu, "'");

const tokenize = (text: string): string[] =>
  normalizeText(text)
    .replace(/[^a-z0-9'\s-]/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);

const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const median = (values: ReadonlyArray<number>): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
};

const countMatches = (text: string, pattern: RegExp): number =>
  [...text.matchAll(pattern)].length;

const ABSTRACT_NOUN_PATTERN =
  /\b[a-z]+(?:tion|sion|ment|ness|ity|ance|ence|ship|hood|ism|acy|ure)\b/giu;
const PASSIVE_PATTERN =
  /\b(?:am|is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?[a-z]+(?:ed|en)\b/giu;
const DIALOGUE_LINE_PATTERN = /(?:^|\n)\s*["'][^"'\n]+["']/gmu;
const FIGURATIVE_PATTERN =
  /\b(?:like a|like an|as if|as though|seemed to|appeared to)\b/giu;

export const measureNarrationStyle = (
  modelOutput: ModelNarrationOutput,
): NarrationStyleMetrics => {
  const texts = modelOutput.readerProse.paragraphs.map(({ text }) => text);
  const prose = texts.join("\n");
  const sentences = texts.flatMap(splitSentences);
  const sentenceWords = sentences.map((sentence) => tokenize(sentence).length);
  const wordCount = tokenize(prose).length;
  const abstractNounCount = countMatches(prose, ABSTRACT_NOUN_PATTERN);
  const passiveConstructionCount = countMatches(prose, PASSIVE_PATTERN);
  return {
    paragraphCount: texts.length,
    sentenceCount: sentences.length,
    wordCount,
    sentenceWords,
    medianSentenceWords: median(sentenceWords),
    averageSentenceWords:
      sentenceWords.length === 0
        ? 0
        : sentenceWords.reduce((sum, value) => sum + value, 0) /
          sentenceWords.length,
    shortSentenceShare:
      sentenceWords.length === 0
        ? 0
        : sentenceWords.filter((value) => value <= 8).length /
          sentenceWords.length,
    abstractNounCount,
    abstractNounDensity: wordCount === 0 ? 0 : abstractNounCount / wordCount,
    passiveConstructionCount,
    passiveConstructionShare:
      sentences.length === 0 ? 0 : passiveConstructionCount / sentences.length,
    dialogueLineCount: countMatches(prose, DIALOGUE_LINE_PATTERN),
    figurativeSignalCount: countMatches(prose, FIGURATIVE_PATTERN),
  };
};

const pushFlag = (
  findings: NarrationLintFinding[],
  ruleId: NarrationLintRuleId,
  count: number,
): void => {
  if (count <= 0) return;
  const existing = findings.find((finding) => finding.ruleId === ruleId);
  if (existing) {
    existing.count += count;
    return;
  }
  findings.push({
    ruleId,
    classification: "heuristic",
    severity: "warning",
    count,
    blocking: false,
  });
};

const paragraphHasRole = (
  paragraph: ModelNarrationOutput["readerProse"]["paragraphs"][number],
  role: PenelopeScenePlan["sentencePlans"][number]["role"],
  roleByPlanId: ReadonlyMap<string, PenelopeScenePlan["sentencePlans"][number]["role"]>,
): boolean =>
  paragraph.sentencePlanIds.some(
    (sentencePlanId) => roleByPlanId.get(sentencePlanId) === role,
  );

const hasFiniteNarratorVerb = (text: string): boolean =>
  /\b(?:am|is|are|was|were|be|been|being|has|have|had|do|does|did|can|could|will|would|shall|should|may|might|must|[a-z]+(?:ed|ing|s))\b/iu.test(
    text,
  );

const effectiveStyleValues = (
  styleProfile: PenelopeEnglishStyleProfile,
  styleStateId: string,
) => {
  const override = styleProfile.styleStates.find(
    ({ stateId }) => stateId === styleStateId,
  )?.leverOverrides;
  return {
    sentenceLength:
      override?.sentenceLengthDistribution ??
      styleProfile.levers.sentenceLengthDistribution.value,
    abstraction:
      override?.abstractionBudget ?? styleProfile.levers.abstractionBudget.value,
    dialogue:
      override?.dialogueDensity ?? styleProfile.levers.dialogueDensity.value,
    figurative:
      override?.figurativeLanguageBudget ??
      styleProfile.levers.figurativeLanguageBudget.value,
  };
};

export const lintNarration = ({
  modelOutput,
  scenePlan,
  styleProfile,
  styleStateId,
}: NarrationLintInput): NarrationLintResult => {
  const findings: NarrationLintFinding[] = [];
  const paragraphs = modelOutput.readerProse.paragraphs;
  const prose = paragraphs.map(({ text }) => text).join("\n\n");
  const normalized = normalizeText(prose);
  const sentences = paragraphs.flatMap(({ text }) => splitSentences(text));
  const roleByPlanId = new Map(
    scenePlan.sentencePlans.map(({ sentencePlanId, role }) => [
      sentencePlanId,
      role,
    ]),
  );
  const dialogueParagraphs = paragraphs.filter((paragraph) =>
    paragraphHasRole(paragraph, "licensed_dialogue", roleByPlanId),
  );
  const dialoguePlans = scenePlan.sentencePlans.filter(
    ({ role }) => role === "licensed_dialogue",
  );

  pushFlag(
    findings,
    "FC-01",
    dialogueParagraphs.filter(({ text }) =>
      /\b(?:the point is|the lesson is|this means|our world|the rules|i feel|my heart|what this teaches)\b/iu.test(
        text,
      ),
    ).length +
      dialoguePlans.filter(({ plainIntent }) =>
        /\b(?:explain|teach|theme|lesson|rules? of (?:the )?world|own inner state|what (?:this|it) means|i feel because)\b/iu.test(
          plainIntent ?? "",
        ),
      ).length,
  );
  pushFlag(
    findings,
    "FC-02",
    paragraphs.filter((paragraph) => {
      const boundPlans = paragraph.sentencePlanIds
        .map((sentencePlanId) =>
          scenePlan.sentencePlans.find(
            (plan) => plan.sentencePlanId === sentencePlanId,
          ),
        )
        .filter((plan) => plan !== undefined);
      const hasConcreteBinding = boundPlans.some(
        (plan) =>
          plan.actorId !== null ||
          plan.sourceFactIds.length > 0 ||
          plan.sourceEventIds.length > 0 ||
          plan.speechEventIds.length > 0 ||
          plan.licensedRenderingDetailIds.length > 0,
      );
      return (
        !hasConcreteBinding &&
        splitSentences(paragraph.text).some((sentence) =>
          /^(?:everyone|no one|all people|one must|the truth|life|fate)\b.*\b(?:always|never|must|is)\b/iu.test(
            sentence,
          ),
        )
      );
    }).length,
  );
  pushFlag(
    findings,
    "FC-03",
    dialogueParagraphs.filter(({ text }) =>
      /["'][^"']*(?:\bwhat is [^?]+\?|\b(?:always|never)\b[^"']{0,80}\b(?:always|never)\b|\b(?:riddle|truth wears|fate speaks)\b)[^"']*["']/iu.test(
        text,
      ),
    ).length +
      dialoguePlans.filter(({ plainIntent }) =>
        /\b(?:riddle|aphorism|maxim|symbolic slogan|general truth|fate|destiny|truth wears|meaning of life)\b/iu.test(
          plainIntent ?? "",
        ),
      ).length,
  );
  pushFlag(
    findings,
    "FC-04",
    sentences.filter((sentence) =>
      /^(?:silence|fear|fate|destiny|history|truth|justice|memory|the city|the night)\b[^.!?]{0,50}\b(?:wanted|decided|refused|watched|waited|remembered|knew|demanded|whispered)\b/iu.test(
        sentence,
      ),
    ).length,
  );
  pushFlag(
    findings,
    "FC-05",
    sentences.filter((sentence) =>
      /\b(?:eyes?|hands?|heart|mouth|sword|door|silence|shadow|memory)\b[^.!?]{0,30}\b(?:spoke|answered|decided|refused|promised|declared)\b/iu.test(
        sentence,
      ),
    ).length,
  );
  pushFlag(
    findings,
    "FC-06",
    sentences.filter((sentence) =>
      /^(?:never had|only then did|gone was|into .+ (?:came|walked)|so [a-z]+ was|such was)\b/iu.test(
        sentence,
      ),
    ).length,
  );
  pushFlag(
    findings,
    "FC-07",
    sentences.filter(
      (sentence, index) =>
        index > 0 &&
        tokenize(sentence).length <= 6 &&
        !hasFiniteNarratorVerb(sentence) &&
        !paragraphs.some(
          (paragraph) =>
            paragraph.text.includes(sentence) &&
            paragraphHasRole(paragraph, "licensed_dialogue", roleByPlanId),
        ),
    ).length,
  );
  pushFlag(
    findings,
    "FC-08",
    countMatches(
      prose,
      /\b(?:thou|thee|thy|thine|hath|doth|wherefore|verily|ere|twas|methinks|forsooth|whence|hither|yon|wine-dark|rosy-fingered|grey-eyed|far-shooting|breaker of horses|lord of the war cry)\b/giu,
    ) +
      countMatches(
        prose,
        /\b[A-Z][a-z]+,\s+(?:breaker|keeper|lord|lady|daughter|son) of [A-Za-z -]+/gu,
      ),
  );

  const metrics = measureNarrationStyle(modelOutput);
  const styleValues = effectiveStyleValues(styleProfile, styleStateId);
  const translationeseSentenceCount = sentences.filter((sentence) => {
    const abstractNouns = countMatches(sentence, ABSTRACT_NOUN_PATTERN);
    const passives = countMatches(sentence, PASSIVE_PATTERN);
    const explicitAgent = /\bby\s+(?:the\s+)?[a-z]+\b/iu.test(sentence);
    return abstractNouns >= 2 && passives >= 1 && !explicitAgent;
  }).length;
  pushFlag(
    findings,
    "FC-09",
    translationeseSentenceCount,
  );
  const firstSentence = normalizeText(sentences.at(0) ?? "");
  const lastSentence = normalizeText(sentences.at(-1) ?? "");
  const firstTokens = tokenize(firstSentence);
  const lastTokens = tokenize(lastSentence);
  const mirroredSentence =
    firstTokens.length >= 4 &&
    lastTokens.length >= 4 &&
    firstTokens.slice(0, 4).join(" ") === lastTokens.slice(-4).join(" ");
  const roleSequence = scenePlan.sentencePlans.map(({ role }) => role);
  const mirroredRoleAssembly =
    roleSequence.length >= 4 &&
    roleSequence.join("|") === [...roleSequence].reverse().join("|");
  pushFlag(
    findings,
    "FC-10",
    sentences.filter((sentence) =>
      /\b(?:thus|therefore|in the end|this meant that|the lesson was|and so it was settled|everything had come full circle)\b/iu.test(
        sentence,
      ),
    ).length + Number(mirroredSentence || mirroredRoleAssembly),
  );

  const endingMode = styleProfile.levers.endingMode.value[scenePlan.sceneMode];
  const finalSentence = sentences.at(-1) ?? "";
  const closureSignal =
    /\b(?:at last|finally|never again|was over|had ended|for good|nothing remained)\b/iu.test(
      finalSentence,
    );
  const openSignal = /\?|\b(?:still|waited|remained|for now|not yet)\b/iu.test(
    finalSentence,
  );
  pushFlag(
    findings,
    "AC-END-02",
    Number(endingMode === "in_world_open" && closureSignal) +
      Number(endingMode === "in_world_closure" && openSignal),
  );

  // These are measurements only. Advisory-band misses never become blockers or
  // padding instructions, and no literary-quality verdict is emitted.
  void normalized;
  void styleValues.sentenceLength;
  void styleValues.dialogue;
  void styleValues.figurative;

  const warningCount = findings.reduce(
    (count, finding) => count + finding.count,
    0,
  );
  return {
    findings: findings.sort((left, right) =>
      left.ruleId.localeCompare(right.ruleId),
    ),
    metrics,
    warningCount,
    criticRecommended: warningCount > 0,
    blocking: false,
  };
};
