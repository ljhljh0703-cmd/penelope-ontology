import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach } from "vitest";
import { describe, expect, it } from "vitest";

const script = resolve(process.cwd(), "scripts/smoke-deployment.mjs");

const run = (url?: string, expectedSha?: string) =>
  spawnSync(process.execPath, [script, ...(url ? [url] : []), ...(expectedSha ? [expectedSha] : [])], {
    encoding: "utf8",
    env: { ...process.env, DEPLOYMENT_URL: "", EXPECTED_SHA: "" },
  });

const servers: Server[] = [];

const listen = async (server: Server): Promise<string> => {
  servers.push(server);
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/`;
};

const runAsync = (url: string, expectedSha = "a".repeat(40)) =>
  new Promise<{ status: number | null; stderr: string; stdout: string }>((resolveRun) => {
    const child = spawn(process.execPath, [script, url, expectedSha], {
      env: { ...process.env, DEPLOYMENT_URL: "", EXPECTED_SHA: "" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("close", (status) => resolveRun({ status, stderr, stdout }));
  });

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolveClose) => server.close(() => resolveClose())),
    ),
  );
});

describe("deployment smoke script URL gate", () => {
  it("requires an explicit URL", () => {
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Pass a deployment URL");
  });

  it("requires an explicit expected build SHA", () => {
    const result = run("https://example.com/");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("expected build SHA");
  });

  it("rejects non-commit local build labels", () => {
    const result = run("http://127.0.0.1:3210/", "local-unset");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("exact 40-character lowercase Git SHA");
  });

  it("rejects credentials and non-local HTTP", () => {
    const credentialed = run("https://user:secret@example.com/", "a".repeat(40));
    expect(credentialed.status).toBe(1);
    expect(credentialed.stderr).toContain("must not contain credentials");
    expect(credentialed.stderr).not.toContain("secret");

    const insecure = run("http://example.com/", "a".repeat(40));
    expect(insecure.status).toBe(1);
    expect(insecure.stderr).toContain("must use HTTPS");
  });

  it("rejects paths, queries, and fragments", () => {
    for (const url of [
      "https://example.com/demo",
      "https://example.com/?preview=true",
      "https://example.com/#proof",
    ]) {
      expect(run(url, "a".repeat(40)).status).toBe(1);
    }
  });

  it("refuses to certify an origin that redirects to another server", async () => {
    const target = await listen(
      createServer((_request, response) => {
        response.writeHead(200, { "content-type": "text/html" });
        response.end("Penelope Ontology · The Night of the Scar");
      }),
    );
    const redirect = await listen(
      createServer((_request, response) => {
        response.writeHead(302, { location: target });
        response.end();
      }),
    );

    const result = await runAsync(redirect);
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("DEPLOYMENT_SMOKE_PASS");
    expect(result.stderr).toContain("DEPLOYMENT_SMOKE_FAIL");
  });

  it("rejects the retired Story Workbench shell markers", async () => {
    const origin = await listen(
      createServer((_request, response) => {
        response.writeHead(200, {
          "content-type": "text/html",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
          "permissions-policy": "camera=(), microphone=(), geolocation=()",
        });
        response.end("FIXTURE MODE · NO LIVE CALL");
      }),
    );

    const result = await runAsync(origin);
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("DEPLOYMENT_SMOKE_PASS");
    expect(result.stderr).toContain("Penelope Ontology");
  });

  it("refuses to certify a different deployed build identity", async () => {
    const origin = await listen(
      createServer((request, response) => {
        if (request.url?.startsWith("/api/health")) {
          response.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          response.end(JSON.stringify({
            status: "ok",
            buildSha: "different-build",
            publicMode: "fixture",
            liveModelImplemented: true,
            liveEvidenceReadinessRecorded: true,
            corePipelineImplemented: true,
            frozenReplayImplemented: true,
          }));
          return;
        }
        response.writeHead(200, {
          "content-type": "text/html",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
          "permissions-policy": "camera=(), microphone=(), geolocation=()",
        });
        response.end("Penelope Ontology · The Night of the Scar");
      }),
    );

    const result = await runAsync(origin, "b".repeat(40));
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("DEPLOYMENT_SMOKE_PASS");
    expect(result.stderr).toContain("expected build");
  });

  it("continues past health for an honest false live-evidence readiness signal", async () => {
    const expectedSha = "c".repeat(40);
    const origin = await listen(
      createServer((request, response) => {
        if (request.url?.startsWith("/api/health")) {
          response.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          response.end(JSON.stringify({
            status: "ok",
            buildSha: expectedSha,
            publicMode: "fixture",
            liveModelImplemented: true,
            liveEvidenceReadinessRecorded: false,
            corePipelineImplemented: true,
            frozenReplayImplemented: true,
          }));
          return;
        }
        if (request.url?.startsWith("/api/demo")) {
          response.writeHead(503, { "content-type": "application/json" });
          response.end("{}");
          return;
        }
        response.writeHead(200, {
          "content-type": "text/html",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
          "permissions-policy": "camera=(), microphone=(), geolocation=()",
        });
        response.end("Penelope Ontology · The Night of the Scar");
      }),
    );

    const result = await runAsync(origin, expectedSha);
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("DEPLOYMENT_SMOKE_PASS");
    expect(result.stderr).not.toContain("Health endpoint");
    expect(result.stderr).toContain("Demo endpoint returned 503");
  });

  it("refuses to certify a deployment without a boolean live-evidence readiness signal", async () => {
    const expectedSha = "d".repeat(40);
    const origin = await listen(
      createServer((request, response) => {
        if (request.url?.startsWith("/api/health")) {
          response.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          response.end(JSON.stringify({
            status: "ok",
            buildSha: expectedSha,
            publicMode: "fixture",
            liveModelImplemented: true,
            corePipelineImplemented: true,
            frozenReplayImplemented: true,
          }));
          return;
        }
        response.writeHead(200, {
          "content-type": "text/html",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
          "permissions-policy": "camera=(), microphone=(), geolocation=()",
        });
        response.end("Penelope Ontology · The Night of the Scar");
      }),
    );

    const result = await runAsync(origin, expectedSha);
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("DEPLOYMENT_SMOKE_PASS");
    expect(result.stderr).toContain("Health endpoint");
  });
});
