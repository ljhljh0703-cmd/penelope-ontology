import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Canonical } from "@/src/domain/canonical-json";
import {
  StyleAblationBlindPacketSchema,
  StyleAblationBlindRatingsSchema,
  StyleAblationCaptureReceiptSchema,
  StyleAblationCaptureSchema,
  StyleAblationPlanSchema,
  type StyleAblationBlindRatings,
  type StyleAblationPublicReport,
} from "@/src/evaluation/style-ablation-contracts";
import {
  assertStyleAblationCaptureReceiptBinding,
  buildStyleAblationBlindPacket,
  evaluateStyleAblation,
} from "@/src/evaluation/style-ablation-evaluator";
import {
  STYLE_ABLATION_EVIDENCE_LOCATORS,
  STYLE_ABLATION_LOCAL_PROOF_LOCATORS,
} from "@/src/evaluation/style-ablation-evidence-verifier";

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, "utf8")) as unknown;

export const parseStyleAblationFinalizeArgs = (
  args: ReadonlyArray<string>,
): { ratingsPath?: string } => {
  if (args.length === 0) return {};
  if (args.length === 2 && args[0] === "--ratings" && args[1].trim().length > 0) {
    return { ratingsPath: args[1] };
  }
  throw new Error("Usage: finalize-style-ablation.ts [--ratings <blind-ratings.json>]");
};

export const writeStyleAblationPublicReportOnce = async (
  filePath: string,
  report: unknown,
): Promise<void> => {
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
};

const pretty = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const isErrorCode = (error: unknown, code: string): boolean =>
  error instanceof Error && "code" in error && error.code === code;

export const writeStyleAblationBlindRatingsIdempotently = async (
  filePath: string,
  ratingsInput: StyleAblationBlindRatings | unknown,
): Promise<"written" | "already_exact"> => {
  const ratings = StyleAblationBlindRatingsSchema.parse(ratingsInput);
  const source = pretty(ratings);
  try {
    await writeFile(filePath, source, { encoding: "utf8", flag: "wx" });
    return "written";
  } catch (error) {
    if (!isErrorCode(error, "EEXIST")) throw error;
    const stat = await lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error("Existing private blind-ratings path is not a regular file.");
    }
    if ((await readFile(filePath, "utf8")) !== source) {
      throw new Error("Refusing to replace non-identical private blind ratings.");
    }
    return "already_exact";
  }
};

export const finalizeStyleAblation = async ({
  root,
  ratingsPath,
  evaluatedAt,
}: {
  root: string;
  ratingsPath?: string;
  evaluatedAt: string;
}): Promise<StyleAblationPublicReport> => {
  const plan = StyleAblationPlanSchema.parse(
    await readJson(path.join(root, STYLE_ABLATION_EVIDENCE_LOCATORS.plan)),
  );
  const capture = StyleAblationCaptureSchema.parse(
    await readJson(path.join(root, STYLE_ABLATION_LOCAL_PROOF_LOCATORS.capture)),
  );
  const storedBlindPacket = StyleAblationBlindPacketSchema.parse(
    await readJson(path.join(root, STYLE_ABLATION_LOCAL_PROOF_LOCATORS.blindPacket)),
  );
  const receipt = StyleAblationCaptureReceiptSchema.parse(
    await readJson(path.join(root, STYLE_ABLATION_EVIDENCE_LOCATORS.receipt)),
  );

  assertStyleAblationCaptureReceiptBinding({ plan, capture, receipt });
  const expectedBlindPacket = buildStyleAblationBlindPacket(plan, capture);
  if (sha256Canonical(storedBlindPacket) !== sha256Canonical(expectedBlindPacket)) {
    throw new Error("Stored blind packet does not match the exact plan and capture.");
  }

  const ratings = ratingsPath
    ? StyleAblationBlindRatingsSchema.parse(
        await readJson(path.resolve(root, ratingsPath)),
      )
    : undefined;
  const report = evaluateStyleAblation({
    plan,
    capture,
    ratings,
    evaluatedAt,
  });

  if (ratings) {
    const privateRatingsPath = path.join(
      root,
      STYLE_ABLATION_LOCAL_PROOF_LOCATORS.ratings,
    );
    await mkdir(path.dirname(privateRatingsPath), { recursive: true });
    await writeStyleAblationBlindRatingsIdempotently(privateRatingsPath, ratings);
  }

  const publicPath = path.join(root, STYLE_ABLATION_EVIDENCE_LOCATORS.report);
  await mkdir(path.dirname(publicPath), { recursive: true });
  await writeStyleAblationPublicReportOnce(publicPath, report);
  return report;
};

const main = async (): Promise<void> => {
  const root = process.cwd();
  const { ratingsPath } = parseStyleAblationFinalizeArgs(process.argv.slice(2));
  const report = await finalizeStyleAblation({
    root,
    ratingsPath,
    evaluatedAt: new Date().toISOString(),
  });
  process.stdout.write(
    `STYLE_ABLATION_FINALIZED status=${report.status} public=artifacts/evidence/style-ablation.json\n`,
  );
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown finalization failure.";
    process.stderr.write(`STYLE_ABLATION_FINALIZE_FAILED ${message}\n`);
    process.exitCode = 1;
  });
}
