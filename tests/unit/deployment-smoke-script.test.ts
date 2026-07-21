import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach } from "vitest";
import { describe, expect, it } from "vitest";

const script = resolve(process.cwd(), "scripts/smoke-deployment.mjs");
const creatorStarterPack = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "examples/world-packs/creator-owned-starter.json"),
    "utf8",
  ),
) as { packId: string; presentation: { publicTitle: string } };

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

const canonicalJson = (value: unknown): string => {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (candidate && typeof candidate === "object") {
      return Object.fromEntries(
        Object.keys(candidate)
          .sort()
          .map((key) => [key, normalize((candidate as Record<string, unknown>)[key])]),
      );
    }
    return candidate;
  };
  return JSON.stringify(normalize(value));
};

const signed = <Payload extends Record<string, unknown>, Field extends string>(
  payload: Payload,
  field: Field,
): Payload & Record<Field, string> => ({
  ...payload,
  [field]: createHash("sha256").update(canonicalJson(payload)).digest("hex"),
}) as Payload & Record<Field, string>;

const readJson = async (request: import("node:http").IncomingMessage) => {
  let raw = "";
  for await (const chunk of request) raw += String(chunk);
  return JSON.parse(raw) as Record<string, unknown>;
};

const sendJson = (
  response: import("node:http").ServerResponse,
  status: number,
  payload: unknown,
  headers: Record<string, string> = {},
) => {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(payload));
};

const portableSmokeServer = ({
  creatorTitle = "The Lantern Ledger",
}: {
  creatorTitle?: string;
} = {}) => {
  const expectedSha = "a".repeat(40);
  const overlay = signed({ id: "creator_canon", version: 1, rules: ["rule.red_sail"] }, "hash");
  const snapshot = (turnIndex: number, harborWatch: string) =>
    signed(
      {
        turnIndex,
        canonHash: overlay.hash,
        overlayId: overlay.id,
        overlayVersion: overlay.version,
        worldPackVersion: "1.0.0",
        canonProfileId: "canon.default",
        styleProfileId: "style.default",
        baseStateId: "state.harbor",
        variables: [{ id: "harbor_watch", value: harborWatch }],
      },
      "stateHash",
    );
  const snapshots = [snapshot(0, "idle"), snapshot(1, "watching"), snapshot(2, "signal_seen")];
  const received: { registered?: Record<string, unknown>; creator?: Record<string, unknown> } = {};

  return {
    received,
    server: createServer(async (request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/") {
        response.writeHead(200, {
          "content-type": "text/html",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
          "permissions-policy": "camera=(), microphone=(), geolocation=()",
        });
        response.end("Penelope Ontology · Opening a world");
        return;
      }
      if (url.pathname === "/api/health") {
        sendJson(response, 200, {
          status: "ok",
          buildSha: expectedSha,
          publicMode: "fixture",
          liveModelImplemented: true,
          liveEvidenceReadinessRecorded: false,
          corePipelineImplemented: true,
          frozenReplayImplemented: true,
        });
        return;
      }
      if (url.pathname === "/api/world/session" && request.method === "POST") {
        const body = await readJson(request);
        if (body.packId === "pack.oz.discovery_of_the_wizard") {
          received.registered = body;
          sendJson(
            response,
            200,
            {
              worldPack: {
                packId: "pack.oz.discovery_of_the_wizard",
                packVersion: "1.0.0",
                availability: "registered",
                publicTitle: "Behind the Green Screen",
              },
            },
            { "x-penelope-creator-access": "registered-capability" },
          );
          return;
        }
        if (body.creatorPackDefinition) {
          received.creator = body;
          sendJson(
            response,
            200,
            {
              worldPack: {
                packId: "pack.creator_owned.lantern_ledger",
                packVersion: "1.0.0",
                availability: "session_private",
                publicTitle: creatorTitle,
              },
            },
            { "x-penelope-creator-access": "creator-capability" },
          );
          return;
        }
        sendJson(response, 400, { error: "unknown world session" });
        return;
      }
      if (url.pathname === "/api/demo") {
        sendJson(response, 200, {
          mode: "fixture",
          proofs: {
            grounded: { status: "passed" },
            conflict: { status: "needs_creator_decision" },
          },
          replayResults: [{ status: "pass" }],
          overlay: {},
          snapshot: {},
          registeredRehearsal: {
            frozen: true,
            draftFixtureId: "fixture.red_sail",
            styleProfileId: "style.default",
            taskType: "rehearsal",
            brief: "A bounded fixture rehearsal.",
            participantIntents: [{ id: "intent.one" }, { id: "intent.two" }],
          },
        });
        return;
      }
      if (url.pathname === "/api/runs" && request.method === "POST") {
        const body = await readJson(request);
        if (body.modelMode === "live") {
          sendJson(response, 403, { error: { code: "public_live_disabled" } });
          return;
        }
        sendJson(response, 200, {
          status: "needs_creator_decision",
          proposals: [{
            id: "proposal.red_sail",
            proposalHash: "proposal-hash",
            baseOverlayId: "creator_canon",
            baseOverlayVersion: 0,
            baseOverlayHash: "base-overlay-hash",
          }],
        });
        return;
      }
      if (url.pathname === "/api/decisions" && request.method === "POST") {
        sendJson(response, 200, {
          decision: { status: "applied", overlay, snapshot: snapshots[0] },
          overlayReplay: {
            overlayHash: overlay.hash,
            allPassed: true,
            replayResults: Array.from({ length: 4 }, () => ({ status: "pass" })),
          },
        });
        return;
      }
      if (url.pathname === "/api/transitions" && request.method === "POST") {
        const body = await readJson(request);
        const step = body.step === 1 ? 1 : 2;
        const from = snapshots[step - 1];
        const to = snapshots[step];
        sendJson(response, 200, {
          status: "applied",
          violations: [],
          snapshot: to,
          transition: {
            status: "applied",
            fromStateHash: from.stateHash,
            toStateHash: to.stateHash,
            toSnapshot: to,
            action: { from: from.variables[0].value, to: to.variables[0].value },
          },
        });
        return;
      }
      sendJson(response, 404, { error: "not found" });
    }),
  };
};

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
        response.end("Penelope Ontology · Opening a world");
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

  it("certifies registered and creator-owned portable world sessions", async () => {
    const { server, received } = portableSmokeServer();
    const origin = await listen(server);

    const result = await runAsync(origin);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("DEPLOYMENT_SMOKE_PASS");
    expect(result.stdout).toContain("registered-world-pack");
    expect(result.stdout).toContain("creator-world-pack");
    expect(received.registered).toEqual({
      transport: "fixture",
      packId: "pack.oz.discovery_of_the_wizard",
    });
    expect(received.creator).toMatchObject({
      transport: "fixture",
      creatorPackDefinition: {
        packId: creatorStarterPack.packId,
        presentation: { publicTitle: creatorStarterPack.presentation.publicTitle },
      },
    });
  });

  it("fails closed when the creator import is presented as another world", async () => {
    const { server } = portableSmokeServer({ creatorTitle: "The Borrowed Ledger" });
    const origin = await listen(server);

    const result = await runAsync(origin);

    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("DEPLOYMENT_SMOKE_PASS");
    expect(result.stderr).toContain("Creator world session does not match");
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
        response.end("Penelope Ontology · Opening a world");
      }),
    );

    const result = await runAsync(origin, "b".repeat(40));
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("DEPLOYMENT_SMOKE_PASS");
    expect(result.stderr).toContain("expected build");
  });

  it("continues past health for an honest false live-evidence readiness signal", async () => {
    const expectedSha = "c".repeat(40);
    let worldSessionCount = 0;
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
        if (request.url?.startsWith("/api/world/session")) {
          request.resume();
          worldSessionCount += 1;
          sendJson(
            response,
            200,
            {
              worldPack: worldSessionCount === 1
                ? {
                    packId: "pack.oz.discovery_of_the_wizard",
                    packVersion: "1.0.0",
                    availability: "registered",
                    publicTitle: "Behind the Green Screen",
                  }
                : {
                    packId: "pack.creator_owned.lantern_ledger",
                    packVersion: "1.0.0",
                    availability: "session_private",
                    publicTitle: "The Lantern Ledger",
                  },
            },
            { "x-penelope-creator-access": "capability" },
          );
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
        response.end("Penelope Ontology · Opening a world");
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
        response.end("Penelope Ontology · Opening a world");
      }),
    );

    const result = await runAsync(origin, expectedSha);
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("DEPLOYMENT_SMOKE_PASS");
    expect(result.stderr).toContain("Health endpoint");
  });
});
