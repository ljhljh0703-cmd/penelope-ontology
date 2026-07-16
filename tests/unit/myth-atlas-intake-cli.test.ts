import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseMythAtlasIntakeArgs,
  runMythAtlasIntakeCli,
} from "@/scripts/intake-myth-atlas";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Myth Atlas intake CLI", () => {
  it("parses one exact root, manifest, and use mode", () => {
    expect(
      parseMythAtlasIntakeArgs([
        "--use",
        "private_creative_reference",
        "--manifest",
        "/tmp/handoff/manifest.json",
        "--root",
        "/tmp/handoff",
      ]),
    ).toEqual({
      root: "/tmp/handoff",
      manifestPath: "/tmp/handoff/manifest.json",
      requestedUse: "private_creative_reference",
    });
    expect(() =>
      parseMythAtlasIntakeArgs([
        "--root",
        "/tmp/handoff",
        "--root",
        "/tmp/other",
        "--use",
        "private_creative_reference",
      ]),
    ).toThrow(/arguments_invalid/u);
  });

  it("fails closed with a path-free schema error receipt", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "myth-atlas-cli-"));
    roots.push(root);
    const manifestPath = path.join(root, "manifest.json");
    await writeFile(manifestPath, "{}\n", "utf8");
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };

    expect(
      await runMythAtlasIntakeCli({
        args: [
          "--root",
          root,
          "--manifest",
          manifestPath,
          "--use",
          "private_creative_reference",
        ],
        stdout,
        stderr,
      }),
    ).toBe(1);
    expect(stdout.write).not.toHaveBeenCalled();
    const errorSource = String(stderr.write.mock.calls[0]?.[0]);
    expect(JSON.parse(errorSource)).toMatchObject({
      schemaId: "penelope.myth-atlas-intake-error",
      code: "manifest_schema_invalid",
    });
    expect(errorSource).not.toContain(root);
  });
});
