import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import {
  MythAtlasUseModeSchema,
  type MythAtlasUseMode,
} from "@/src/integrations/myth-atlas/contracts";
import {
  inspectMythAtlasHandoff,
  MythAtlasIntakeError,
} from "@/src/integrations/myth-atlas/intake";

export class MythAtlasIntakeCliError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MythAtlasIntakeCliError";
  }
}

export type MythAtlasIntakeCliArgs = {
  root: string;
  manifestPath: string;
  requestedUse: MythAtlasUseMode;
};

export const parseMythAtlasIntakeArgs = (
  args: readonly string[],
): MythAtlasIntakeCliArgs => {
  if (args.length !== 6) throw new MythAtlasIntakeCliError("arguments_invalid");
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag || !value || values.has(flag)) {
      throw new MythAtlasIntakeCliError("arguments_invalid");
    }
    values.set(flag, value);
  }
  if (
    values.size !== 3 ||
    !values.has("--root") ||
    !values.has("--manifest") ||
    !values.has("--use")
  ) {
    throw new MythAtlasIntakeCliError("arguments_invalid");
  }
  const root = values.get("--root");
  const manifestPath = values.get("--manifest");
  const requestedUse = MythAtlasUseModeSchema.safeParse(values.get("--use"));
  if (!root || !manifestPath || !requestedUse.success) {
    throw new MythAtlasIntakeCliError("arguments_invalid");
  }
  return { root, manifestPath, requestedUse: requestedUse.data };
};

const readManifestInsideRoot = async ({
  root,
  manifestPath,
}: Pick<MythAtlasIntakeCliArgs, "root" | "manifestPath">): Promise<unknown> => {
  if (!path.isAbsolute(root) || !path.isAbsolute(manifestPath)) {
    throw new MythAtlasIntakeCliError("path_not_absolute");
  }
  try {
    const [rootReal, manifestReal, manifestStat] = await Promise.all([
      realpath(root),
      realpath(manifestPath),
      lstat(manifestPath),
    ]);
    const relative = path.relative(rootReal, manifestReal);
    if (
      !manifestStat.isFile() ||
      manifestStat.isSymbolicLink() ||
      relative.length === 0 ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error("unsafe manifest");
    }
    return JSON.parse(await readFile(manifestReal, "utf8")) as unknown;
  } catch {
    throw new MythAtlasIntakeCliError("manifest_invalid");
  }
};

export const runMythAtlasIntakeCli = async ({
  args = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
}: {
  args?: readonly string[];
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
} = {}): Promise<number> => {
  try {
    const parsed = parseMythAtlasIntakeArgs(args);
    const manifest = await readManifestInsideRoot(parsed);
    const receipt = await inspectMythAtlasHandoff({
      root: parsed.root,
      manifest,
      requestedUse: parsed.requestedUse,
    });
    stdout.write(`${JSON.stringify(receipt)}\n`);
    return receipt.decision === "quarantined_private_reference" ? 0 : 2;
  } catch (error) {
    const code = error instanceof MythAtlasIntakeCliError
      ? error.code
      : error instanceof MythAtlasIntakeError
        ? error.code
        : error instanceof ZodError
          ? "manifest_schema_invalid"
        : "unexpected_failure";
    stderr.write(
      `${JSON.stringify({ schemaId: "penelope.myth-atlas-intake-error", schemaVersion: "1.0.0", code })}\n`,
    );
    return 1;
  }
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  void runMythAtlasIntakeCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
