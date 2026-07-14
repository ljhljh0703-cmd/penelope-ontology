import { zodTextFormat } from "openai/helpers/zod";
import { sha256Canonical } from "@/src/domain/canonical-json";
import {
  STYLE_ABLATION_OUTPUT_SCHEMA_NAME,
  StyleAblationModelInputSchema,
  StyleAblationNarrativeSchema,
  StyleAblationPlanSchema,
  type StyleAblationCondition,
  type StyleAblationPlan,
} from "@/src/evaluation/style-ablation-contracts";

export const buildStyleAblationTextFormat = () =>
  zodTextFormat(StyleAblationNarrativeSchema, STYLE_ABLATION_OUTPUT_SCHEMA_NAME);

export type StyleAblationRequestBody = {
  model: "gpt-5.6";
  reasoning: { effort: "medium" };
  max_output_tokens: 4096;
  instructions: string;
  input: string;
  text: { format: ReturnType<typeof buildStyleAblationTextFormat> };
  store: false;
};

export type StyleAblationScheduledCall = {
  callId: string;
  pairId: string;
  ordinal: number;
  condition: StyleAblationCondition;
  blindSampleId: string;
  model: "gpt-5.6";
  reasoningEffort: "medium";
  maxOutputTokens: 4096;
  instructions: string;
  modelInput: ReturnType<typeof StyleAblationModelInputSchema.parse>;
  outputSchemaName: "style_ablation_narrative";
  requestBody: StyleAblationRequestBody;
  commonRequestSha256: string;
  fullRequestSha256: string;
  outputSchemaSha256: string;
};

const buildRequestBody = (
  plan: StyleAblationPlan,
  modelInput: ReturnType<typeof StyleAblationModelInputSchema.parse>,
): StyleAblationRequestBody => ({
  model: plan.targetModel,
  reasoning: { effort: plan.reasoningEffort },
  max_output_tokens: plan.maxOutputTokens,
  instructions: plan.commonInstructions,
  input: JSON.stringify(modelInput),
  text: { format: buildStyleAblationTextFormat() },
  store: false,
});

const commonRequestPayload = (plan: StyleAblationPlan) => {
  const commonInput = StyleAblationModelInputSchema.parse({
    ...plan.commonInput,
    creatorStyleBundle: null,
  });
  const requestBody = buildRequestBody(plan, commonInput);
  return {
    ...requestBody,
    input: JSON.stringify(plan.commonInput),
  };
};

const blindSampleIdFor = (evaluationId: string, callId: string): string =>
  `sample.${sha256Canonical({ evaluationId, callId, namespace: "blind-v1" }).slice(0, 16)}`;

export const parseStyleAblationPlan = (input: unknown): StyleAblationPlan =>
  StyleAblationPlanSchema.parse(input);

export const buildStyleAblationSchedule = (
  input: StyleAblationPlan | unknown,
): StyleAblationScheduledCall[] => {
  const plan = parseStyleAblationPlan(input);
  const commonRequestSha256 = sha256Canonical(commonRequestPayload(plan));
  const outputSchemaSha256 = sha256Canonical(buildStyleAblationTextFormat());
  let ordinal = 0;

  return plan.pairs.flatMap(({ pairId, order }) =>
    order.map((condition) => {
      ordinal += 1;
      const callId = `call.${ordinal}`;
      const modelInput = StyleAblationModelInputSchema.parse({
        ...plan.commonInput,
        creatorStyleBundle: condition === "profiled" ? plan.styleBundle : null,
      });
      const requestBody = buildRequestBody(plan, modelInput);
      return {
        callId,
        pairId,
        ordinal,
        condition,
        blindSampleId: blindSampleIdFor(plan.evaluationId, callId),
        model: plan.targetModel,
        reasoningEffort: plan.reasoningEffort,
        maxOutputTokens: plan.maxOutputTokens,
        instructions: plan.commonInstructions,
        modelInput,
        outputSchemaName: plan.outputContract.name,
        requestBody,
        commonRequestSha256,
        fullRequestSha256: sha256Canonical(requestBody),
        outputSchemaSha256,
      };
    }),
  );
};

export const styleBundleOnlyDifference = (
  left: StyleAblationScheduledCall,
  right: StyleAblationScheduledCall,
): boolean => {
  const { creatorStyleBundle: leftStyle, ...leftCommonInput } = left.modelInput;
  const { creatorStyleBundle: rightStyle, ...rightCommonInput } = right.modelInput;
  return (
    left.model === right.model &&
    left.reasoningEffort === right.reasoningEffort &&
    left.maxOutputTokens === right.maxOutputTokens &&
    left.instructions === right.instructions &&
    left.outputSchemaName === right.outputSchemaName &&
    left.outputSchemaSha256 === right.outputSchemaSha256 &&
    left.commonRequestSha256 === right.commonRequestSha256 &&
    sha256Canonical(left.requestBody.text.format) ===
      sha256Canonical(right.requestBody.text.format) &&
    sha256Canonical(leftCommonInput) === sha256Canonical(rightCommonInput) &&
    sha256Canonical(leftStyle) !== sha256Canonical(rightStyle)
  );
};
