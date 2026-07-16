import process from "node:process";
import { createCodexCliStoryModel } from "@/src/adapters/codex-cli/story-model";
import { loadRedSailStoryBundle } from "@/src/adapters/filesystem/story-data";
import {
  createFixtureStorySession,
  runFixtureStoryTurn,
  runStoryTurn,
} from "@/src/application/run-story-turn";
import type {
  StoryChoice,
  StoryModelTrace,
  StorySession,
  StoryTurnResult,
} from "@/src/contracts/story";

type DemoTransport = "fixture" | "codex_cli";
type DemoBranch = "quiet" | "bell";

const option = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
};

const parseTransport = (): DemoTransport => {
  const value = option("--transport") ?? "fixture";
  if (value === "fixture" || value === "codex_cli") return value;
  throw new Error("--transport must be fixture or codex_cli.");
};

const parseBranch = (): DemoBranch => {
  const value = option("--branch") ?? "quiet";
  if (value === "quiet" || value === "bell") return value;
  throw new Error("--branch must be quiet or bell.");
};

const firstChoiceId = (branch: DemoBranch): string =>
  branch === "quiet"
    ? "choice.keep_quiet_watch"
    : "choice.ring_public_bell";

const registeredChoice = (
  choices: readonly StoryChoice[],
  choiceId: string,
): StoryChoice => {
  const choice = choices.find((candidate) => candidate.choiceId === choiceId);
  if (!choice) throw new Error(`Registered demo choice is missing: ${choiceId}`);
  return choice;
};

const publicTrace = (trace: StoryModelTrace) => ({
  mode: trace.mode,
  requestedModel: trace.requestedModel,
  actualModel: trace.actualModel,
  responseId: trace.responseId,
  outputSha256: trace.outputSha256,
  processDiagnostics: trace.processDiagnostics,
});

const publicScene = (
  scene: StorySession["scenes"][number],
  trace: StoryModelTrace | null,
  storyStateHash: string,
) => ({
  sceneNumber: scene.sceneNumber,
  title: scene.title,
  prose: scene.prose,
  resolutionOutcome: scene.resolution.outcome,
  resolutionSummary: scene.resolution.summary,
  sceneHash: scene.sceneHash,
  storyStateHash,
  groundedClaimIds: Array.from(
    new Set(scene.segments.flatMap(({ groundingClaimIds }) => groundingClaimIds)),
  ),
  echoedEffectIds: scene.echoedEffectIds,
  residualHook: scene.residualHook,
  trace: trace ? publicTrace(trace) : null,
});

const main = async (): Promise<void> => {
  const transport = parseTransport();
  const branch = parseBranch();
  const bundle = await loadRedSailStoryBundle();
  const bootstrap = createFixtureStorySession(bundle);
  const model =
    transport === "codex_cli"
      ? createCodexCliStoryModel({ timeoutMs: 180_000 })
      : null;
  let session = bootstrap.session;
  const scenes = [
    publicScene(bootstrap.opening, null, bootstrap.session.storyStateHash),
  ];
  let choice = registeredChoice(
    bootstrap.choices,
    firstChoiceId(branch),
  );

  while (session.status === "active") {
    let result: StoryTurnResult;
    if (transport === "fixture") {
      result = runFixtureStoryTurn({
        ...bundle,
        request: { session, choice },
      });
    } else {
      if (!model) throw new Error("The Codex CLI story model was not initialized.");
      result = await runStoryTurn({
        ...bundle,
        request: { session, choice },
        model,
        transport: "codex_cli",
      });
    }
    session = result.session;
    scenes.push(publicScene(result.scene, result.trace, session.storyStateHash));
    if (session.status === "active") {
      const next = result.scene.suggestedContinuations[0];
      if (!next) throw new Error("The active demo scene exposed no continuation.");
      choice = next;
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        scenario: bootstrap.scenario,
        transport,
        branch,
        status: session.status,
        generatedTurnCount: transport === "codex_cli" ? scenes.length - 1 : 0,
        modelClaim:
          transport === "codex_cli"
            ? "Codex CLI story run; requested gpt-5.6-sol. Actual serving model is not independently reported by this transport."
            : "Deterministic rehearsal fixture; no live model call is implied.",
        scenes,
      },
      null,
      2,
    )}\n`,
  );
};

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Story demo failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
