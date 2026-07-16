import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve(process.cwd(), "scripts/privacy-scan.mjs");
const roots: string[] = [];
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});
const pngCrc = (buffer: Buffer): number => {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

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

  it("rejects textual or EXIF metadata embedded in a public PNG", () => {
    const root = makeRoot();
    const signature = Buffer.from("89504e470d0a1a0a", "hex");
    const type = Buffer.from("tEXt", "ascii");
    const data = Buffer.from("private-note", "utf8");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(pngCrc(Buffer.concat([type, data])));
    writeFileSync(
      resolve(root, "screenshot.png"),
      Buffer.concat([signature, length, type, data, crc]),
    );

    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("screenshot.png:1: [png_unapproved_chunk]");
    expect(result.stderr).not.toContain("private-note");
  });

  it("rejects bytes appended after the exact PNG end without echoing them", () => {
    const root = makeRoot();
    const source = readFileSync(
      resolve(process.cwd(), "docs/assets/demo/01-frozen-rehearsal.png"),
    );
    const personalPath = ["", "Users", "example", "secret.txt"].join("/");
    const secret = `sk-proj-${"z".repeat(32)} PRIVATE=${personalPath}`;
    writeFileSync(
      resolve(root, "trailing-secret.png"),
      Buffer.concat([source, Buffer.from(secret, "utf8")]),
    );
    writeFileSync(
      resolve(root, "trailing-harmless.png"),
      Buffer.concat([source, Buffer.from("harmless trailing bytes", "utf8")]),
    );

    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "trailing-secret.png:1: [png_invalid_structure]",
    );
    expect(result.stderr).toContain(
      "trailing-harmless.png:1: [png_invalid_structure]",
    );
    expect(result.stderr).not.toContain(secret);
  });

  it("scans BOM-marked UTF-16 and printable strings inside unknown binaries", () => {
    const root = makeRoot();
    const personalPath = ["", "Users", "encoded-user", "private.txt"].join("/");
    const encodedToken = `sk-proj-${"u".repeat(32)}`;
    const utf16 = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(`OPENAI_API_KEY=${encodedToken} ${personalPath}\n`, "utf16le"),
    ]);
    writeFileSync(resolve(root, "encoded.txt"), utf16);
    const binaryToken = `ghp_${"b".repeat(36)}`;
    writeFileSync(
      resolve(root, "unknown.bin"),
      Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(binaryToken), Buffer.from([0])]),
    );

    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("encoded.txt:1: [secret_openai_key]");
    expect(result.stderr).toContain("encoded.txt:1: [personal_absolute_path]");
    expect(result.stderr).toContain("unknown.bin:2: [secret_api_key]");
    expect(result.stderr).not.toContain(encodedToken);
    expect(result.stderr).not.toContain(binaryToken);
  });

  it("scans BOM-less UTF-16 in both byte orders", () => {
    const root = makeRoot();
    const personalPath = ["", "Users", "encoded-user", "private.txt"].join("/");
    const encodedToken = `sk-proj-${"q".repeat(32)}`;
    const source = `OPENAI_API_KEY=${encodedToken} ${personalPath}\n`;
    writeFileSync(resolve(root, "bomless-le.bin"), Buffer.from(source, "utf16le"));
    const bigEndian = Buffer.from(source, "utf16le");
    bigEndian.swap16();
    writeFileSync(resolve(root, "bomless-be.bin"), bigEndian);

    const result = run(root);
    expect(result.status).toBe(1);
    for (const name of ["bomless-le.bin", "bomless-be.bin"]) {
      expect(result.stderr).toContain(`${name}:1: [secret_openai_key]`);
      expect(result.stderr).toContain(`${name}:1: [personal_absolute_path]`);
    }
    expect(result.stderr).not.toContain(encodedToken);
    expect(result.stderr).not.toContain(personalPath);
  });

});
