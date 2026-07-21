#!/usr/bin/env node

import { lstatSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const EXIT_FINDINGS = 1;
const EXIT_USAGE = 2;
const OPENAI_KEY = /\bsk-(?:(?:proj|svcacct)-)?[a-z0-9_-]{20,}\b/i;
const SENSITIVE_ASSIGNMENT = /\b[A-Z][A-Z0-9_]{1,30}_API_KEY\b\s*[:=]\s*["']?(\$\{[^}]+\}|[^\s"'#;,}]+)/;
const MAC_PERSONAL_PATH = /\/Users\/[a-z0-9._-]+(?:\/[^\s"'`<>]*)?/i;
const LINUX_PERSONAL_PATH = /\/home\/[a-z0-9._-]+(?:\/[^\s"'`<>]*)?/i;
const WINDOWS_PERSONAL_PATH = /\b[a-z]:\\{1,2}Users\\{1,2}[^\\\s"'`<>]+(?:\\{1,2}[^\s"'`<>]*)?/i;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const SESSION_CONTEXT = /(?:\/feedback|session[_ -]?id|thread[_ -]?id|conversation[_ -]?id|codex[_ -]?session)/i;
const SPEAKER_LINE = /^\s*(user|assistant|system)\s*:\s+\S/i;
const INTERNAL_CONTEXT_MARKER = "<" + "codex_internal_" + "context";
const TURN_CONTEXT_MARKER = '"' + "turn_" + "context" + '"';
const RESPONSE_ITEM_MARKER = '"' + "response_" + "item" + '"';
const SESSION_META_MARKER = "session_" + "meta.payload.id";
const JSON_ROLE_FIELD = '"' + "role" + '"';
const JSON_CONTENT_FIELD = '"' + "content" + '"';
const JSON_USER_VALUE = '"' + "user" + '"';
const JSON_ASSISTANT_VALUE = '"' + "assistant" + '"';
const PNG_SIGNATURE = "89504e470d0a1a0a";
const PNG_ALLOWED_CHUNKS = new Set(["IHDR", "IDAT", "IEND"]);
const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const crc32 = (buffer) => {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
};

const SECRET_TOKEN_PATTERNS = [
  { code: "secret_openai_key", pattern: OPENAI_KEY },
  { code: "secret_api_key", pattern: /\bsk-ant-[a-z0-9_-]{20,}\b/i },
  { code: "secret_api_key", pattern: /\bgh[pousr]_[a-z0-9]{30,}\b/i },
  { code: "secret_api_key", pattern: /\bgithub_pat_[a-z0-9_]{30,}\b/i },
  { code: "secret_api_key", pattern: /\bAIza[a-z0-9_-]{35}\b/i },
  { code: "secret_api_key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
];

const FALLBACK_SKIP_DIRECTORIES = new Set([
  ".git",
  ".next",
  "coverage",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const FALLBACK_SKIP_FILE_SUFFIXES = [".tsbuildinfo"];

const normalizePath = (value) => value.split(sep).join("/");

const isPlaceholder = (value) => {
  const normalized = value.trim().replace(/^['"]|['"]$/g, "");
  if (!normalized) return true;
  if (/^<[^>]+>$/.test(normalized)) return true;
  if (/^\$\{[^}]+\}$/.test(normalized)) return true;
  return /^(?:redacted|placeholder|example|changeme|replace[_-]?me|your[_-]?(?:openai[_-]?)?api[_-]?key|test[_-]?key)$/i.test(
    normalized,
  );
};

const gitCandidates = (root) => {
  const topLevel = spawnSync("git", ["-C", root, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  if (topLevel.status !== 0 || resolve(topLevel.stdout.trim()) !== root) return null;

  const listed = spawnSync(
    "git",
    ["-C", root, "ls-files", "-co", "--exclude-standard", "-z"],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  if (listed.status !== 0) {
    throw new Error(listed.stderr.trim() || "git ls-files failed");
  }
  return listed.stdout.split("\0").filter(Boolean).sort();
};

const fallbackCandidates = (root) => {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && FALLBACK_SKIP_DIRECTORIES.has(entry.name)) continue;
      if (
        entry.isFile() &&
        FALLBACK_SKIP_FILE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))
      ) {
        continue;
      }
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
      } else {
        files.push(normalizePath(relative(root, absolutePath)));
      }
    }
  };
  walk(root);
  return files.sort();
};

const listCandidates = (root) => gitCandidates(root) ?? fallbackCandidates(root);

const pathFindings = (relativePath) => {
  const normalized = normalizePath(relativePath);
  const segments = normalized.split("/");
  const findings = [];
  if (segments.includes("private-submission")) {
    findings.push({ line: 1, code: "private_submission_path", message: "private-submission content is public" });
  }
  if (normalized.startsWith("artifacts/live/")) {
    findings.push({ line: 1, code: "raw_live_artifact_path", message: "raw live evidence is public" });
  }
  const basename = segments.at(-1) ?? "";
  if (basename === ".env" || (basename.startsWith(".env.") && basename !== ".env.example")) {
    findings.push({ line: 1, code: "secret_env_path", message: "a non-example environment file is public" });
  }
  return findings;
};

const scanText = (text) => {
  const findings = [];
  const lines = text.split(/\r?\n/);
  const speakerLines = [];
  let jsonUserLine = null;
  let jsonAssistantLine = null;
  let jsonContentSeen = false;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    const secretToken = SECRET_TOKEN_PATTERNS.find(({ pattern }) => pattern.test(line));
    if (secretToken) {
      findings.push({ line: lineNumber, code: secretToken.code, message: "a high-confidence secret token is present" });
    }

    const assignment = line.match(SENSITIVE_ASSIGNMENT);
    if (!secretToken && assignment && !isPlaceholder(assignment[1])) {
      findings.push({ line: lineNumber, code: "secret_api_assignment", message: "a supported API key variable has a non-placeholder value" });
    }

    if (MAC_PERSONAL_PATH.test(line) || LINUX_PERSONAL_PATH.test(line) || WINDOWS_PERSONAL_PATH.test(line)) {
      findings.push({ line: lineNumber, code: "personal_absolute_path", message: "a user-home absolute path is present" });
    }

    if (UUID.test(line) && SESSION_CONTEXT.test(line)) {
      findings.push({ line: lineNumber, code: "feedback_session_identifier", message: "a feedback, thread, or conversation identifier is present" });
    }

    if (
      line.includes(INTERNAL_CONTEXT_MARKER) ||
      line.includes(TURN_CONTEXT_MARKER) ||
      line.includes(RESPONSE_ITEM_MARKER) ||
      line.includes(SESSION_META_MARKER)
    ) {
      findings.push({ line: lineNumber, code: "raw_codex_context", message: "raw Codex context or rollout structure is present" });
    }

    const speaker = line.match(SPEAKER_LINE)?.[1]?.toLowerCase();
    if (speaker) speakerLines.push({ line: lineNumber, speaker });

    if (line.includes(JSON_ROLE_FIELD) && line.includes(JSON_USER_VALUE)) jsonUserLine ??= lineNumber;
    if (line.includes(JSON_ROLE_FIELD) && line.includes(JSON_ASSISTANT_VALUE)) jsonAssistantLine ??= lineNumber;
    if (line.includes(JSON_CONTENT_FIELD)) jsonContentSeen = true;
  });

  const speakers = new Set(speakerLines.map(({ speaker }) => speaker));
  if (speakers.has("user") && speakers.has("assistant")) {
    findings.push({
      line: speakerLines[0].line,
      code: "raw_conversation_transcript",
      message: "alternating user and assistant transcript lines are present",
    });
  }
  if (jsonUserLine && jsonAssistantLine && jsonContentSeen) {
    findings.push({
      line: Math.min(jsonUserLine, jsonAssistantLine),
      code: "raw_conversation_export",
      message: "a user/assistant conversation export is present",
    });
  }

  return findings;
};

const scanBinaryMetadata = (buffer) => {
  if (buffer.length < 8 || buffer.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) {
    return [];
  }
  const compressed = [];
  let offset = 8;
  let sawHeader = false;
  let sawData = false;
  let sawEnd = false;
  try {
    while (offset < buffer.length) {
      if (offset + 12 > buffer.length || sawEnd) {
        throw new Error("invalid PNG chunk boundary");
      }
      const length = buffer.readUInt32BE(offset);
      const end = offset + 12 + length;
      if (end > buffer.length) throw new Error("invalid PNG chunk length");
      const typeBuffer = buffer.subarray(offset + 4, offset + 8);
      const type = typeBuffer.toString("ascii");
      if (!/^[A-Za-z]{4}$/.test(type)) throw new Error("invalid PNG chunk type");
      const data = buffer.subarray(offset + 8, offset + 8 + length);
      const expectedCrc = buffer.readUInt32BE(offset + 8 + length);
      if (crc32(Buffer.concat([typeBuffer, data])) !== expectedCrc) {
        throw new Error("invalid PNG chunk CRC");
      }
      if (!PNG_ALLOWED_CHUNKS.has(type)) {
        return [{
          line: 1,
          code: "png_unapproved_chunk",
          message: "a public PNG contains an unapproved ancillary or metadata chunk",
        }];
      }
      if (!sawHeader) {
        if (type !== "IHDR" || length !== 13) throw new Error("missing PNG header");
        sawHeader = true;
      } else if (type === "IHDR") {
        throw new Error("duplicate PNG header");
      }
      if (type === "IDAT") {
        if (sawEnd) throw new Error("PNG data after end");
        sawData = true;
        compressed.push(Buffer.from(data));
      }
      if (type === "IEND") {
        if (!sawData || length !== 0 || end !== buffer.length) {
          throw new Error("invalid PNG end");
        }
        sawEnd = true;
      }
      offset = end;
    }
    if (!sawHeader || !sawData || !sawEnd || offset !== buffer.length) {
      throw new Error("incomplete PNG structure");
    }
  } catch {
    return [{
      line: 1,
      code: "png_invalid_structure",
      message: "a public PNG has malformed chunks or bytes after its exact end",
    }];
  }
  try {
    const source = Buffer.concat(compressed);
    const inflated = inflateSync(source, { info: true, maxOutputLength: 64 * 1024 * 1024 });
    if (inflated.engine.bytesWritten !== source.length) {
      return [{
        line: 1,
        code: "png_trailing_payload",
        message: "a public PNG contains bytes after its compressed pixel stream",
      }];
    }
  } catch {
    return [{
      line: 1,
      code: "png_invalid_stream",
      message: "a public PNG has an invalid or oversized compressed pixel stream",
    }];
  }
  return [];
};

const scanFile = (root, relativePath) => {
  const absolutePath = resolve(root, relativePath);
  const stat = lstatSync(absolutePath);
  const findings = pathFindings(relativePath);
  if (stat.isSymbolicLink()) {
    return [...findings, ...scanText(readlinkSync(absolutePath))];
  }
  if (!stat.isFile()) return findings;
  const buffer = readFileSync(absolutePath);
  if (buffer.subarray(0, 8).toString("hex") === PNG_SIGNATURE) {
    return [...findings, ...scanBinaryMetadata(buffer)];
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return [...findings, ...scanText(buffer.subarray(2).toString("utf16le"))];
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const source = Buffer.from(buffer.subarray(2));
    if (source.length % 2 !== 0) {
      return [...findings, {
        line: 1,
        code: "binary_invalid_encoding",
        message: "a public binary has malformed UTF-16 content",
      }];
    }
    source.swap16();
    return [...findings, ...scanText(source.toString("utf16le"))];
  }
  if (buffer.length >= 8 && buffer.length % 2 === 0) {
    const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
    const pairs = Math.floor(sample.length / 2);
    let evenNulls = 0;
    let oddNulls = 0;
    for (let index = 0; index < pairs * 2; index += 2) {
      if (sample[index] === 0) evenNulls += 1;
      if (sample[index + 1] === 0) oddNulls += 1;
    }
    const looksLittleEndian = oddNulls / pairs >= 0.3 && evenNulls / pairs <= 0.1;
    const looksBigEndian = evenNulls / pairs >= 0.3 && oddNulls / pairs <= 0.1;
    if (looksLittleEndian) {
      return [...findings, ...scanText(buffer.toString("utf16le"))];
    }
    if (looksBigEndian) {
      const source = Buffer.from(buffer);
      source.swap16();
      return [...findings, ...scanText(source.toString("utf16le"))];
    }
  }
  if (buffer.subarray(0, 8192).includes(0)) {
    const printable = buffer
      .toString("latin1")
      .replace(/[^\x20-\x7e\r\n\t]+/g, "\n");
    return [...findings, ...scanText(printable)];
  }
  return [...findings, ...scanText(buffer.toString("utf8"))];
};

export const scanRoot = (rootInput) => {
  const root = resolve(rootInput);
  const files = listCandidates(root);
  const findings = files.flatMap((file) =>
    scanFile(root, file).map((finding) => ({ file: normalizePath(file), ...finding })),
  );
  findings.sort((left, right) =>
    left.file.localeCompare(right.file) || left.line - right.line || left.code.localeCompare(right.code),
  );
  return { root, files, findings };
};

const usage = () => "Usage: node scripts/privacy-scan.mjs [--root <directory>]";

const parseRoot = (args) => {
  let root = process.cwd();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--root") {
      const value = args[index + 1];
      if (!value) throw new Error("--root requires a directory");
      root = value;
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      console.log(usage());
      return null;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return root;
};

const main = () => {
  try {
    const root = parseRoot(process.argv.slice(2));
    if (root === null) return;
    const result = scanRoot(root);
    if (result.findings.length > 0) {
      for (const finding of result.findings) {
        console.error(`${finding.file}:${finding.line}: [${finding.code}] ${finding.message}`);
      }
      console.error(`PRIVACY_SCAN_FAIL findings=${result.findings.length} files=${result.files.length}`);
      process.exitCode = EXIT_FINDINGS;
      return;
    }
    console.log(`PRIVACY_SCAN_OK files=${result.files.length}`);
  } catch (error) {
    console.error(`PRIVACY_SCAN_ERROR ${error instanceof Error ? error.message : String(error)}`);
    console.error(usage());
    process.exitCode = EXIT_USAGE;
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
