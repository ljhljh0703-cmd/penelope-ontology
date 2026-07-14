import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve(process.cwd(), "scripts/privacy-scan.mjs");
const roots: string[] = [];

const makeRoot = () => {
  const root = mkdtempSync(resolve(tmpdir(), "narrative-privacy-scan-"));
  roots.push(root);
  return root;
};

const run = (root: string) =>
  spawnSync(process.execPath, [script, "--root", root], {
    encoding: "utf8",
  });

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("privacy scan script", () => {
  it("accepts placeholders and prohibition prose", () => {
    const root = makeRoot();
    writeFileSync(
      resolve(root, "safe.txt"),
      [
        "Never commit API keys, personal absolute paths, raw conversations, or /feedback IDs.",
        "OPENAI_API_KEY=",
        "OPENAI_API_KEY=<set-at-runtime>",
      ].join("\n"),
    );

    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PRIVACY_SCAN_OK files=1");
  });

  it("ignores generated TypeScript incremental metadata without a Git index", () => {
    const root = makeRoot();
    const generatedPath = ["", "Users", "generated-machine", "private", "cache.ts"].join("/");
    writeFileSync(
      resolve(root, "tsconfig.tsbuildinfo"),
      JSON.stringify({ fileNames: [generatedPath] }),
    );
    writeFileSync(resolve(root, "safe.txt"), "public source\n");

    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PRIVACY_SCAN_OK files=1");
  });

  it("reports secret tokens with a file and line without echoing the token", () => {
    const root = makeRoot();
    const token = "sk-proj-" + "a".repeat(32);
    writeFileSync(resolve(root, "leak.txt"), `OPENAI_API_KEY=${token}\n`);

    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("leak.txt:1: [secret_openai_key]");
    expect(result.stderr).not.toContain(token);
  });

  it("recognizes another high-confidence API token family", () => {
    const root = makeRoot();
    const token = "ghp_" + "c".repeat(36);
    writeFileSync(resolve(root, "credential.txt"), `${token}\n`);

    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("credential.txt:1: [secret_api_key]");
    expect(result.stderr).not.toContain(token);
  });

  it("reports personal paths and contextual feedback IDs", () => {
    const root = makeRoot();
    const personalPath = ["", "Users", "sample-user", "private", "notes.md"].join("/");
    const feedbackId = ["019f4952", "26ec", "7ab3", "b393", "5bf78388a76a"].join("-");
    writeFileSync(
      resolve(root, "metadata.txt"),
      [`source=${personalPath}`, `/feedback session_id=${feedbackId}`].join("\n"),
    );

    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("metadata.txt:1: [personal_absolute_path]");
    expect(result.stderr).toContain("metadata.txt:2: [feedback_session_identifier]");
  });

  it("reports transcript structure and public private-submission files", () => {
    const root = makeRoot();
    const privateDirectory = resolve(root, "private-" + "submission");
    mkdirSync(privateDirectory);
    writeFileSync(resolve(privateDirectory, "record.txt"), "private record\n");
    writeFileSync(
      resolve(root, "chat.txt"),
      [("Us" + "er: private request"), ("Assist" + "ant: private response")].join("\n"),
    );

    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("chat.txt:1: [raw_conversation_transcript]");
    expect(result.stderr).toContain("private-submission/record.txt:1: [private_submission_path]");
  });

});
