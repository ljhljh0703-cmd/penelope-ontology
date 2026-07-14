import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  StyleAblationBlindRatingsSchema,
  StyleAblationCaptureReceiptSchema,
  StyleAblationCaptureSchema,
  StyleAblationPlanSchema,
} from "@/src/evaluation/style-ablation-contracts";
import {
  assertStyleAblationCaptureReceiptBinding,
  evaluateStyleAblation,
} from "@/src/evaluation/style-ablation-evaluator";

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

const main = async (): Promise<void> => {
  const root = process.cwd();
  const { ratingsPath } = parseStyleAblationFinalizeArgs(process.argv.slice(2));
  const plan = StyleAblationPlanSchema.parse(
    await readJson(path.join(root, "data", "evals", "style-ablation-plan.json")),
  );
  const capture = StyleAblationCaptureSchema.parse(
    await readJson(
      path.join(root, "artifacts", "live", "style-ablation", "raw-capture.json"),
    ),
  );
  const receipt = StyleAblationCaptureReceiptSchema.parse(
    await readJson(
      path.join(
        root,
        "artifacts",
        "evidence",
        "style-ablation-capture-receipt.json",
      ),
    ),
  );
  assertStyleAblationCaptureReceiptBinding({ plan, capture, receipt });
  const ratings = ratingsPath
    ? StyleAblationBlindRatingsSchema.parse(await readJson(path.resolve(ratingsPath)))
    : undefined;
  const report = evaluateStyleAblation({
    plan,
    capture,
    ratings,
    evaluatedAt: new Date().toISOString(),
  });
  const publicDirectory = path.join(root, "artifacts", "evidence");
  const publicPath = path.join(publicDirectory, "style-ablation.json");
  await mkdir(publicDirectory, { recursive: true });
  await writeStyleAblationPublicReportOnce(publicPath, report);
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
