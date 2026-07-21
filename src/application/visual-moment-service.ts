import {
  VisualMomentCandidateSchema,
  VisualMomentRequestSchema,
  type VisualMomentCandidate,
  type VisualMomentRequest,
} from "@/src/contracts/visual-moment";
import { sha256Canonical } from "@/src/domain/canonical-json";
import { renderLimitedColorAscii } from "@/src/domain/ascii-renderer";
import type { IllustrationProvider } from "@/src/ports/illustration-provider";

export const createVisualMomentCandidate = async ({
  request: requestInput,
  provider,
}: {
  request: VisualMomentRequest;
  provider: IllustrationProvider;
}): Promise<VisualMomentCandidate> => {
  const request = VisualMomentRequestSchema.parse(requestInput);
  const requestDigest = sha256Canonical(request);
  const { source, trace } = await provider.createSource(request);
  const frame = renderLimitedColorAscii({
    source,
    palette: request.palette,
  });
  return VisualMomentCandidateSchema.parse({
    candidateId: `visual.candidate_${requestDigest.slice(0, 16)}`,
    checkpointId: request.checkpointId,
    status: "candidate",
    trigger: request.trigger,
    requestDigest,
    frame,
    providerTrace: trace,
  });
};
