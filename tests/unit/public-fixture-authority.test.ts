import { describe, expect, it } from "vitest";
import { GET as getDemo } from "@/app/api/demo/route";
import { POST as postDecision } from "@/app/api/decisions/route";
import { POST as postRun } from "@/app/api/runs/route";
import { POST as postTransition } from "@/app/api/transitions/route";
import {
  loadDemoBundle,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import {
  PublicFixtureRunAuthorityError,
  assertRegisteredPublicFixtureRunRequest,
  buildRegisteredPublicFixtureRunRequest,
} from "@/src/application/fixture-creator-authority";

const jsonRequest = (url: string, body: unknown): Request =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const demoRunRequest = (demo: {
  overlay: unknown;
  snapshot: unknown;
  registeredRehearsal: {
    draftFixtureId: string;
    styleProfileId: string;
    taskType: string;
    brief: string;
    participantIntents: Array<{
      intentId: string;
      participantId: string;
      controlledEntityIds: string[];
      intent: string;
    }>;
  };
}) => ({
  modelMode: "fixture" as const,
  draftFixtureId: demo.registeredRehearsal.draftFixtureId,
  overlay: demo.overlay,
  snapshot: demo.snapshot,
  styleProfileId: demo.registeredRehearsal.styleProfileId,
  taskType: demo.registeredRehearsal.taskType,
  brief: demo.registeredRehearsal.brief,
  participantIntents: demo.registeredRehearsal.participantIntents,
});

const creatorDecisionFrom = (proposal: {
  id: string;
  proposalHash: string;
  baseOverlayId: string;
  baseOverlayVersion: number;
  baseOverlayHash: string;
}) => ({
  action: "accept" as const,
  proposalId: proposal.id,
  proposalHash: proposal.proposalHash,
  baseOverlayId: proposal.baseOverlayId,
  baseOverlayVersion: proposal.baseOverlayVersion,
  baseOverlayHash: proposal.baseOverlayHash,
});

describe("registered public fixture authority", () => {
  it("accepts only the complete canonical red-sail replay stage", async () => {
    const [{ replayCases }, registeredOverlay, registeredSnapshot] = await Promise.all([
      loadDemoBundle(),
      loadOverlayFixture("overlay.v0"),
      loadSnapshotFixture("snapshot.s0"),
    ]);
    const registered = buildRegisteredPublicFixtureRunRequest({
      replayCases,
      registeredOverlay,
      registeredSnapshot,
    });
    const assertRegistered = (runRequest: typeof registered) =>
      assertRegisteredPublicFixtureRunRequest({
        replayCases,
        registeredOverlay,
        registeredSnapshot,
        runRequest,
      });

    expect(assertRegistered(structuredClone(registered))).toEqual(registered);

    const changedBrief = { ...registered, brief: `${registered.brief} Relabeled.` };
    const changedIntent = {
      ...registered,
      participantIntents: registered.participantIntents.map((intent, index) =>
        index === 0 ? { ...intent, intent: `${intent.intent} Relabeled.` } : intent,
      ),
    };
    const changedDraft = {
      ...registered,
      draftFixtureId: "draft.grounded_penelope",
    };
    const changedStyle = {
      ...registered,
      styleProfileId: "style.unregistered",
    };
    const changedTask = {
      ...registered,
      taskType: "scene" as const,
    };
    const changedOverlay = {
      ...registered,
      overlay: { ...registered.overlay, version: registered.overlay.version + 1 },
    };
    const changedSnapshot = {
      ...registered,
      snapshot: { ...registered.snapshot, turnIndex: registered.snapshot.turnIndex + 1 },
    };

    for (const mutation of [
      changedBrief,
      changedIntent,
      changedDraft,
      changedStyle,
      changedTask,
      changedOverlay,
      changedSnapshot,
    ]) {
      expect(() => assertRegistered(mutation)).toThrow(
        PublicFixtureRunAuthorityError,
      );
    }
  });

  it("rejects a relabeled brief at the public run route", async () => {
    const demo = await (await getDemo()).json();
    const response = await postRun(
      jsonRequest("http://local.test/api/runs", {
        ...demoRunRequest(demo),
        brief: "Caller-supplied prose must not inherit the red-sail fixture.",
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "public_fixture_authority_invalid",
        message: "The public fixture request must match the registered frozen rehearsal.",
      },
    });
  });

  it("rejects a relabeled participant intent at the creator-decision route", async () => {
    const demo = await (await getDemo()).json();
    const canonicalRequest = demoRunRequest(demo);
    const runResponse = await postRun(
      jsonRequest("http://local.test/api/runs", canonicalRequest),
    );
    expect(runResponse.status).toBe(200);
    const run = await runResponse.json();
    const decision = creatorDecisionFrom(run.proposals[0]);
    const relabeledRequest = {
      ...canonicalRequest,
      participantIntents: canonicalRequest.participantIntents.map((intent, index) =>
        index === 0 ? { ...intent, intent: "A caller changed this frozen intent." } : intent,
      ),
    };

    const response = await postDecision(
      jsonRequest("http://local.test/api/decisions", {
        runRequest: relabeledRequest,
        decision,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toEqual({
      code: "creator_decision_authority_invalid",
      message: "The public fixture request must match the registered frozen rehearsal.",
    });
    expect(payload.error.message).not.toContain(process.cwd());
  });

  it("rejects a relabeled brief at the transition route", async () => {
    const demo = await (await getDemo()).json();
    const canonicalRequest = demoRunRequest(demo);
    const run = await (
      await postRun(jsonRequest("http://local.test/api/runs", canonicalRequest))
    ).json();
    const decision = creatorDecisionFrom(run.proposals[0]);

    const response = await postTransition(
      jsonRequest("http://local.test/api/transitions", {
        runRequest: {
          ...canonicalRequest,
          brief: "A relabeled transition request must not reuse the fixture.",
        },
        decision,
        snapshot: demo.snapshot,
        step: 1,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe("transition_authority_invalid");
    expect(payload.error.message).not.toContain(process.cwd());
  });
});
