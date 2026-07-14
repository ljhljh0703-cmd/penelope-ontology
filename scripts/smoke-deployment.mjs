#!/usr/bin/env node

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const REQUEST_TIMEOUT_MS = 10_000;

const fail = (message) => {
  throw new Error(message);
};

export const normalizeBaseUrl = (rawValue) => {
  if (!rawValue) {
    fail("Pass a deployment URL as the first argument or set DEPLOYMENT_URL.");
  }

  let url;
  try {
    url = new URL(rawValue);
  } catch {
    fail("Deployment URL is invalid.");
  }

  if (url.username || url.password) {
    fail("Deployment URL must not contain credentials.");
  }
  if (url.search || url.hash) {
    fail("Deployment URL must not contain a query string or fragment.");
  }
  if (url.pathname !== "/") {
    fail("Deployment URL must be an origin without a path.");
  }

  const isLocalHttp = url.protocol === "http:" && url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !isLocalHttp) {
    fail("Deployment URL must use HTTPS; HTTP is allowed only for 127.0.0.1.");
  }

  return url;
};

export const normalizeExpectedSha = (rawValue) => {
  if (!rawValue) {
    fail("Pass the expected build SHA as the second argument or set EXPECTED_SHA.");
  }
  if (!/^[a-f0-9]{40}$/.test(rawValue)) {
    fail("Expected build SHA must be the exact 40-character lowercase Git SHA.");
  }
  return rawValue;
};

const canonicalJson = (value) => {
  const normalize = (candidate) => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (candidate && typeof candidate === "object") {
      return Object.fromEntries(
        Object.keys(candidate)
          .sort()
          .map((key) => [key, normalize(candidate[key])]),
      );
    }
    return candidate;
  };
  return JSON.stringify(normalize(value));
};

const sha256Canonical = (value) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");

const assertHasValidHash = (value, hashField, label) => {
  if (!value || typeof value !== "object") fail(`${label} is missing.`);
  const { [hashField]: actualHash, ...payload } = value;
  if (typeof actualHash !== "string" || sha256Canonical(payload) !== actualHash) {
    fail(`${label} has an invalid ${hashField}.`);
  }
};

const fetchWithTimeout = async (url, init = {}) => {
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    headers: {
      accept: "application/json, text/plain, */*",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return response;
};

const expectStatus = (response, expected, label) => {
  if (response.status !== expected) {
    fail(`${label} returned ${response.status}; expected ${expected}.`);
  }
};

export const buildRegisteredFixtureRunRequest = (demo) => {
  const registration = demo?.registeredRehearsal;
  if (
    !registration ||
    typeof registration !== "object" ||
    registration.frozen !== true ||
    typeof registration.draftFixtureId !== "string" ||
    typeof registration.styleProfileId !== "string" ||
    typeof registration.taskType !== "string" ||
    typeof registration.brief !== "string" ||
    !Array.isArray(registration.participantIntents) ||
    registration.participantIntents.length !== 2
  ) {
    fail("Demo endpoint is missing the frozen registered rehearsal authority.");
  }

  return {
    modelMode: "fixture",
    draftFixtureId: registration.draftFixtureId,
    overlay: demo.overlay,
    snapshot: demo.snapshot,
    styleProfileId: registration.styleProfileId,
    taskType: registration.taskType,
    brief: registration.brief,
    participantIntents: registration.participantIntents,
  };
};

export const smokeDeployment = async (baseUrl, expectedSha) => {
  const rootUrl = new URL("./", baseUrl);
  rootUrl.searchParams.set("__smoke_build", expectedSha);
  const rootResponse = await fetchWithTimeout(rootUrl, { cache: "no-store" });
  expectStatus(rootResponse, 200, "Root page");
  const rootHtml = await rootResponse.text();
  for (const marker of ["FIXTURE MODE", "NO LIVE CALL"]) {
    if (!rootHtml.includes(marker)) {
      fail(`Root page is missing the ${marker} marker.`);
    }
  }
  const permissionsPolicy = rootResponse.headers.get("permissions-policy") ?? "";
  if (
    rootResponse.headers.get("x-content-type-options") !== "nosniff" ||
    rootResponse.headers.get("referrer-policy") !== "strict-origin-when-cross-origin" ||
    !["camera=()", "microphone=()", "geolocation=()"].every((directive) =>
      permissionsPolicy.includes(directive),
    )
  ) {
    fail("Root page is missing the required baseline security headers.");
  }

  const healthUrl = new URL("api/health", baseUrl);
  healthUrl.searchParams.set("__smoke_build", expectedSha);
  healthUrl.searchParams.set("__smoke_time", String(Date.now()));
  const healthResponse = await fetchWithTimeout(healthUrl, {
    cache: "no-store",
    headers: { "cache-control": "no-cache" },
  });
  expectStatus(healthResponse, 200, "Health endpoint");
  const health = await healthResponse.json();
  if (
    health.status !== "ok" ||
    health.buildSha !== expectedSha ||
    health.publicMode !== "fixture" ||
    health.corePipelineImplemented !== true ||
    health.frozenReplayImplemented !== true
  ) {
    fail("Health endpoint does not match the expected build and fixture core flags.");
  }

  const demoResponse = await fetchWithTimeout(new URL("api/demo", baseUrl));
  expectStatus(demoResponse, 200, "Demo endpoint");
  const demo = await demoResponse.json();
  const replayIsGreen =
    Array.isArray(demo.replayResults) &&
    demo.replayResults.length > 0 &&
    demo.replayResults.every((result) => result.status === "pass");
  if (
    demo.mode !== "fixture" ||
    demo.proofs?.grounded?.status !== "passed" ||
    demo.proofs?.conflict?.status !== "needs_creator_decision" ||
    !replayIsGreen
  ) {
    fail("Demo endpoint does not match the frozen fixture proof contract.");
  }

  const runRequest = buildRegisteredFixtureRunRequest(demo);
  const runResponse = await fetchWithTimeout(new URL("api/runs", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(runRequest),
  });
  expectStatus(runResponse, 200, "Fixture run");
  const run = await runResponse.json();
  const proposal = run.proposals?.[0];
  if (run.status !== "needs_creator_decision" || !proposal) {
    fail("Fixture run did not stop at the creator proposal gate.");
  }

  const creatorDecision = {
    action: "accept",
    proposalId: proposal.id,
    proposalHash: proposal.proposalHash,
    baseOverlayId: proposal.baseOverlayId,
    baseOverlayVersion: proposal.baseOverlayVersion,
    baseOverlayHash: proposal.baseOverlayHash,
  };
  const decisionResponse = await fetchWithTimeout(new URL("api/decisions", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      runRequest,
      decision: creatorDecision,
    }),
  });
  expectStatus(decisionResponse, 200, "Creator decision");
  const decisionPayload = await decisionResponse.json();
  const decision = decisionPayload.decision;
  const overlayReplay = decisionPayload.overlayReplay;
  if (
    decision?.status !== "applied" ||
    decision.overlay?.version !== 1 ||
    overlayReplay?.overlayHash !== decision.overlay.hash ||
    overlayReplay?.allPassed !== true ||
    overlayReplay.replayResults?.length !== 4 ||
    !overlayReplay.replayResults.every((result) => result.status === "pass")
  ) {
    fail("Creator decision did not return a fresh 4/4 approved-overlay replay.");
  }
  assertHasValidHash(decision.overlay, "hash", "Approved overlay");
  assertHasValidHash(decision.snapshot, "stateHash", "Rebased snapshot");
  if (
    decision.snapshot.canonHash !== decision.overlay.hash ||
    decision.snapshot.overlayId !== decision.overlay.id ||
    decision.snapshot.overlayVersion !== decision.overlay.version ||
    decision.snapshot.turnIndex !== 0
  ) {
    fail("Creator decision returned inconsistent overlay and rebased snapshot authority.");
  }

  let currentSnapshot = decision.snapshot;
  const expectedStates = ["watching", "signal_seen"];
  for (const [index, step] of [1, 2].entries()) {
    const priorSnapshot = currentSnapshot;
    const priorVariable = priorSnapshot.variables?.find(({ id }) => id === "harbor_watch");
    const transitionResponse = await fetchWithTimeout(
      new URL("api/transitions", baseUrl),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runRequest,
          decision: creatorDecision,
          snapshot: currentSnapshot,
          step,
        }),
      },
    );
    expectStatus(transitionResponse, 200, `Transition step ${step}`);
    const transition = await transitionResponse.json();
    const nextSnapshot = transition.snapshot;
    const record = transition.transition;
    const nextVariable = nextSnapshot?.variables?.find(({ id }) => id === "harbor_watch");
    assertHasValidHash(nextSnapshot, "stateHash", `Transition step ${step} snapshot`);
    if (
      transition.status !== "applied" ||
      !Array.isArray(transition.violations) ||
      transition.violations.length !== 0 ||
      nextSnapshot.turnIndex !== step ||
      nextSnapshot.stateHash === priorSnapshot.stateHash ||
      nextSnapshot.canonHash !== decision.overlay.hash ||
      nextSnapshot.overlayId !== decision.overlay.id ||
      nextSnapshot.overlayVersion !== decision.overlay.version ||
      nextSnapshot.worldPackVersion !== priorSnapshot.worldPackVersion ||
      nextSnapshot.canonProfileId !== priorSnapshot.canonProfileId ||
      nextSnapshot.styleProfileId !== priorSnapshot.styleProfileId ||
      nextSnapshot.baseStateId !== priorSnapshot.baseStateId ||
      record?.status !== "applied" ||
      record.fromStateHash !== priorSnapshot.stateHash ||
      record.toStateHash !== nextSnapshot.stateHash ||
      canonicalJson(record.toSnapshot) !== canonicalJson(nextSnapshot) ||
      record.action?.from !== priorVariable?.value ||
      record.action?.to !== expectedStates[index] ||
      nextVariable?.value !== expectedStates[index]
    ) {
      fail(`Transition step ${step} did not preserve the exact authorized hash chain.`);
    }
    currentSnapshot = nextSnapshot;
  }
  const finalVariable = currentSnapshot.variables?.find(
    ({ id }) => id === "harbor_watch",
  );
  if (finalVariable?.value !== "signal_seen") {
    fail("Two-step deployment rehearsal did not reach signal_seen.");
  }

  const liveResponse = await fetchWithTimeout(new URL("api/runs", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ modelMode: "live" }),
  });
  expectStatus(liveResponse, 403, "Public live request");
  const live = await liveResponse.json();
  if (live.error?.code !== "public_live_disabled") {
    fail("Public live request did not fail with public_live_disabled.");
  }

  return {
    origin: baseUrl.origin,
    checks: [
      "root-boundary",
      "security-headers",
      "build-identity",
      "health",
      "fixture-demo",
      "approved-overlay-replay",
      "two-step-transition",
      "live-route-denial",
    ],
  };
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const baseUrl = normalizeBaseUrl(process.argv[2] ?? process.env.DEPLOYMENT_URL);
  const expectedSha = normalizeExpectedSha(
    process.argv[3] ?? process.env.EXPECTED_SHA,
  );
  smokeDeployment(baseUrl, expectedSha)
    .then(({ origin, checks }) => {
      console.log(`DEPLOYMENT_SMOKE_PASS ${origin} build=${expectedSha} ${checks.join(",")}`);
    })
    .catch((error) => {
      console.error(`DEPLOYMENT_SMOKE_FAIL ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
    });
}
