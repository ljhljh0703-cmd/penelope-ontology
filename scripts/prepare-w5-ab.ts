import { getOdysseyBook19WorldSimulation } from "@/src/adapters/fixtures/odyssey-world-simulation";
import styleProfileJson from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import { PenelopeEnglishStyleProfileSchema } from "@/src/contracts/world-narrator";
import { sha256Canonical } from "@/src/domain/canonical-json";
import {
  buildW5CaseSessions,
  buildW5CommonSceneAuthority,
  assertW5CommonSceneAuthorityParity,
} from "@/scripts/w5/cases";
import {
  buildW5PrivateSessionPlan,
  withW5Tense,
  w5PlanFileName,
} from "@/scripts/w5/session";
import { writeW5PrivateJsonOnce } from "@/scripts/w5/private-store";
import {
  assertW5CriticalTreeClean,
  resolveW5RepositoryRoot,
} from "@/scripts/w5/repository";
import { verifyLegacyBaselinePins } from "@/scripts/w5/baseline-a";
import { verifyCandidate22Pin } from "@/scripts/w5/authority-pins";
import {
  assertW5PublicTargetsAvailable,
  w5PublicCaptureFileNames,
  writeW5PublicJsonOnce,
} from "@/scripts/w5/public-store";

const main = async (): Promise<void> => {
  const repoRoot = await resolveW5RepositoryRoot(process.cwd());
  const sourceRevision = assertW5CriticalTreeClean({ repoRoot });
  verifyLegacyBaselinePins({ repoRoot });
  await verifyCandidate22Pin({ repoRoot });
  const scenario = getOdysseyBook19WorldSimulation();
  const cases = buildW5CaseSessions({ scenario });
  const authorities = cases.map(buildW5CommonSceneAuthority);
  const pastStyleProfile = withW5Tense(
    PenelopeEnglishStyleProfileSchema.parse(styleProfileJson),
    "past",
  );
  const pastAuthorities = buildW5CaseSessions({
    scenario,
    styleProfile: pastStyleProfile,
  }).map(buildW5CommonSceneAuthority);
  authorities.forEach((authority, index) => {
    const pastAuthority = pastAuthorities[index];
    if (!pastAuthority) throw new Error("w5_past_authority_missing");
    assertW5CommonSceneAuthorityParity(authority, pastAuthority);
  });
  const plan = buildW5PrivateSessionPlan({
    sourceRevision,
    scenarioSha256: sha256Canonical(scenario),
    authorities,
  });
  const publicFiles = w5PublicCaptureFileNames(plan.maskCommitmentSha256);
  await assertW5PublicTargetsAvailable({
    repoRoot,
    fileNames: [publicFiles.planCommitment],
  });
  const receipt = await writeW5PrivateJsonOnce({
    root: repoRoot,
    relativeName: w5PlanFileName(plan.sessionId),
    value: plan,
  });
  const publicCommitment = await writeW5PublicJsonOnce({
    repoRoot,
    fileName: publicFiles.planCommitment,
    value: {
      schemaVersion: "w5.plan_commitment.v1",
      sessionId: plan.sessionId,
      sourceRevision: plan.sourceRevision,
      scenarioSha256: plan.scenarioSha256,
      maskCommitmentSha256: plan.maskCommitmentSha256,
      modelCallsPlanned: plan.calls.length,
    },
  });
  process.stdout.write(
    `${JSON.stringify({
      status: "W5_PREPARED",
      sessionId: plan.sessionId,
      sourceRevision: plan.sourceRevision,
      maskCommitmentSha256: plan.maskCommitmentSha256,
      planReceipt: receipt,
      publicPlanCommitmentSha256: publicCommitment.sha256,
      modelCallsPlanned: plan.calls.length,
      structuralNoRenderCalls: 0,
    })}\n`,
  );
};

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "w5_prepare_failed"}\n`,
  );
  process.exitCode = 1;
});
