import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const verifier = path.resolve(process.cwd(), "scripts/verify-next-trace-privacy.mjs");

const makeRoot = (): string => {
  const root = mkdtempSync(path.join(tmpdir(), "next-trace-privacy-"));
  roots.push(root);
  mkdirSync(path.join(root, ".next", "server", "app", "api"), {
    recursive: true,
  });
  return root;
};

const writeTrace = (root: string, files: string[]): string => {
  const locator = path.join(
    root,
    ".next",
    "server",
    "app",
    "api",
    "route.js.nft.json",
  );
  writeFileSync(locator, `${JSON.stringify({ version: 1, files })}\n`, "utf8");
  return locator;
};

const run = (root: string) =>
  spawnSync(process.execPath, [verifier], { cwd: root, encoding: "utf8" });

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Next output trace privacy gate", () => {
  it("accepts ordinary runtime dependencies", () => {
    const root = makeRoot();
    writeTrace(root, [
      "../../../../../../../package.json",
      "../../../../../../../data/world-packs/trojan-returns/world.json",
      "../../chunks/runtime.js",
    ]);

    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("NEXT_TRACE_PRIVACY_OK manifests=1 files=3\n");
  });

  it("ignores Vercel's derived output bundle while scanning canonical traces", () => {
    const root = makeRoot();
    writeTrace(root, ["../../../../../../../package.json"]);
    const functions = path.join(root, ".next", "output", "functions");
    mkdirSync(functions, { recursive: true });
    symlinkSync(
      path.join(root, ".next", "server"),
      path.join(functions, "api.func"),
      "dir",
    );

    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("NEXT_TRACE_PRIVACY_OK manifests=1 files=1\n");
  });

  it("fails closed when Vercel's derived output root is itself a symlink", () => {
    const root = makeRoot();
    writeTrace(root, ["../../../../../../../package.json"]);
    const external = path.join(root, "external-output");
    mkdirSync(external);
    symlinkSync(external, path.join(root, ".next", "output"), "dir");

    const result = run(root);
    expect(result.status).toBe(2);
    expect(result.stderr).toBe(
      "NEXT_TRACE_PRIVACY_ERROR invalid_or_missing_trace\n",
    );
  });

  it.each([
    "../../../../../../../private-submission/submission-record.json",
    "../../../../../../../artifacts/live/live-run.json",
    "../../../../../../../.env.local",
    "../../../../../../../.env.production.local",
    "../../../../../../../%70rivate-submission/release-record.json",
  ])("rejects a traced private source without printing it: %s", (entry) => {
    const root = makeRoot();
    writeTrace(root, [entry]);

    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(
      "NEXT_TRACE_PRIVACY_FAIL manifests=1 findings=1\n",
    );
    expect(result.stderr).not.toContain(entry);
  });

  it("fails closed for a symlinked trace file", () => {
    const root = makeRoot();
    const external = path.join(root, "external.json");
    writeFileSync(external, JSON.stringify({ files: [] }), "utf8");
    symlinkSync(
      external,
      path.join(root, ".next", "server", "app", "api", "route.js.nft.json"),
    );

    const result = run(root);
    expect(result.status).toBe(2);
    expect(result.stderr).toBe(
      "NEXT_TRACE_PRIVACY_ERROR invalid_or_missing_trace\n",
    );
  });
});
