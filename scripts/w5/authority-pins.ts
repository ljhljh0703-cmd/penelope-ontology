import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

export const CANDIDATE_2_2_CONTRACT_PATH =
  "_dev/dispatch-2026-07-18/contracts/FABLE-NARRATIVE-AUTHORITY-CONTRACT.json" as const;
export const CANDIDATE_2_2_CONTRACT_SHA256 =
  "f96adc8928e7a9e2029182b8915da7c93a8d012fb0884f4bf421a7d68f94adb4" as const;

export const verifyCandidate22Pin = async ({
  repoRoot,
}: {
  repoRoot: string;
}): Promise<typeof CANDIDATE_2_2_CONTRACT_SHA256> => {
  const target = path.join(repoRoot, CANDIDATE_2_2_CONTRACT_PATH);
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2) {
    throw new Error("w5_candidate_contract_unsafe");
  }
  const digest = createHash("sha256").update(await readFile(target)).digest("hex");
  if (digest !== CANDIDATE_2_2_CONTRACT_SHA256) {
    throw new Error(
      `w5_candidate_contract_pin_mismatch:${CANDIDATE_2_2_CONTRACT_SHA256}:${digest}`,
    );
  }
  return CANDIDATE_2_2_CONTRACT_SHA256;
};
