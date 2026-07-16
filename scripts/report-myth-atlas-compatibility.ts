import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { loadDemoWorldPack } from "@/src/adapters/filesystem/demo-data";
import {
  buildMythAtlasCompatibilityReport,
  MythAtlasCompatibilityError,
} from "@/src/integrations/myth-atlas/compatibility";
import {
  inspectMythAtlasHandoff,
  MythAtlasIntakeError,
} from "@/src/integrations/myth-atlas/intake";

export class MythAtlasCompatibilityCliError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MythAtlasCompatibilityCliError";
  }
}

export type MythAtlasCompatibilityCliArgs = {
  root: string;
  manifestPath: string;
};

export const parseMythAtlasCompatibilityArgs = (
  args: readonly string[],
): MythAtlasCompatibilityCliArgs => {
  if (args.length !== 4) {
    throw new MythAtlasCompatibilityCliError("arguments_invalid");
  }
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag || !value || values.has(flag)) {
      throw new MythAtlasCompatibilityCliError("arguments_invalid");
    }
    values.set(flag, value);
  }
  if (
    values.size !== 2 ||
    !values.has("--root") ||
    !values.has("--manifest")
  ) {
    throw new MythAtlasCompatibilityCliError("arguments_invalid");
  }
  const root = values.get("--root");
  const manifestPath = values.get("--manifest");
  if (!root || !manifestPath) {
    throw new MythAtlasCompatibilityCliError("arguments_invalid");
  }
  return { root, manifestPath };
};

const readManifestInsideRoot = async ({
  root,
  manifestPath,
}: MythAtlasCompatibilityCliArgs): Promise<unknown> => {
  if (!path.isAbsolute(root) || !path.isAbsolute(manifestPath)) {
    throw new MythAtlasCompatibilityCliError("path_not_absolute");
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
  } catch (error) {
    if (error instanceof MythAtlasCompatibilityCliError) throw error;
    throw new MythAtlasCompatibilityCliError("manifest_invalid");
  }
};

const compatibilityErrorCode = (error: unknown): string => {
  if (error instanceof MythAtlasCompatibilityCliError) return error.code;
  if (error instanceof MythAtlasCompatibilityError) return error.code;
  if (error instanceof MythAtlasIntakeError) return error.code;
  return "unexpected_failure";
};

export const runMythAtlasCompatibilityCli = async ({
  args = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
}: {
  args?: readonly string[];
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
} = {}): Promise<number> => {
  try {
    const parsed = parseMythAtlasCompatibilityArgs(args);
    const manifest = await readManifestInsideRoot(parsed);
    let receipt;
    try {
      receipt = await inspectMythAtlasHandoff({
        root: parsed.root,
        manifest,
        requestedUse: "private_creative_reference",
      });
    } catch (error) {
      if (error instanceof ZodError) {
        throw new MythAtlasCompatibilityCliError("manifest_schema_invalid");
      }
      throw error;
    }

    let targetWorldPack;
    try {
      targetWorldPack = await loadDemoWorldPack();
    } catch {
      throw new MythAtlasCompatibilityCliError("target_world_pack_invalid");
    }

    const report = buildMythAtlasCompatibilityReport({
      receipt,
      targetWorldPack,
    });
    stdout.write(`${JSON.stringify(report)}\n`);
    return 0;
  } catch (error) {
    const code = compatibilityErrorCode(error);
    stderr.write(
      `${JSON.stringify({ schemaId: "penelope.myth-atlas-compatibility-error", schemaVersion: "1.0.0", code })}\n`,
    );
    return code === "receipt_not_quarantined_private_reference" ? 2 : 1;
  }
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  void runMythAtlasCompatibilityCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
