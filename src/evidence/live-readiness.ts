const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSha256 = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

const isGpt56Model = (value: unknown): value is string =>
  typeof value === "string" && /^gpt-5\.6(?:$|-[A-Za-z0-9._-]+$)/.test(value);

export type LiveReadinessRecord = {
  evidenceType: "live_readiness";
  status: "verified";
  sanitizedEvidencePath: "artifacts/evidence/live-sanitized.json";
  requestedModel: string;
  actualModel: string;
  authorityBindingVerified: true;
  captureReceiptPath: "artifacts/evidence/live-capture-receipt.json";
  captureReceiptSha256: string;
  captureBindingVerified: true;
  worldPackSha256: string;
  requestSha256: string;
  rawResponsePersistedPublicly: false;
};

export const hasLiveReadinessShape = (
  value: unknown,
): value is LiveReadinessRecord =>
  isRecord(value) &&
  value.evidenceType === "live_readiness" &&
  value.status === "verified" &&
  value.sanitizedEvidencePath === "artifacts/evidence/live-sanitized.json" &&
  isGpt56Model(value.requestedModel) &&
  isGpt56Model(value.actualModel) &&
  value.authorityBindingVerified === true &&
  value.captureReceiptPath === "artifacts/evidence/live-capture-receipt.json" &&
  isSha256(value.captureReceiptSha256) &&
  value.captureBindingVerified === true &&
  isSha256(value.worldPackSha256) &&
  isSha256(value.requestSha256) &&
  value.rawResponsePersistedPublicly === false;
