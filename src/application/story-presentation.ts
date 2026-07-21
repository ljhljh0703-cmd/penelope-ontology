import {
  type StoryChoice,
  type StoryScenario,
  type StorySession,
  type StoryStyleProfile,
} from "@/src/contracts/story";
import { sha256Canonical } from "@/src/domain/canonical-json";

export type StoryPresentationFailureCode =
  | "story_session_complete"
  | "story_session_authority_mismatch"
  | "story_choice_unavailable"
  | "story_choice_text_changed"
  | "story_creator_direction_requires_interview";

export class StoryPresentationError extends Error {
  constructor(readonly code: StoryPresentationFailureCode) {
    super(code);
    this.name = "StoryPresentationError";
  }
}

export const resolvePresentedStoryChoice = ({
  session,
  action: rawAction,
  choiceId,
}: {
  session: StorySession;
  action: string;
  choiceId?: string;
}): StoryChoice => {
  if (session.status === "completed") {
    throw new StoryPresentationError("story_session_complete");
  }
  const action = rawAction.trim();
  const suggestions = session.scenes.at(-1)?.suggestedContinuations ?? [];
  if (choiceId) {
    const registered = suggestions.find((choice) => choice.choiceId === choiceId);
    if (!registered) {
      throw new StoryPresentationError("story_choice_unavailable");
    }
    if (registered.intent !== action) {
      throw new StoryPresentationError("story_choice_text_changed");
    }
    return registered;
  }

  throw new StoryPresentationError(
    "story_creator_direction_requires_interview",
  );
};

const storySpineAuthorityView = (
  spine: StorySession["spine"] | StoryScenario["spine"],
) => ({
  premise: spine.premise,
  dramaticQuestion: spine.dramaticQuestion,
  targetEnding: spine.targetEnding,
  maximumSceneCount: spine.maximumSceneCount,
  forbiddenResolutions: spine.forbiddenResolutions,
  openThreads: spine.openThreads.map(({ status: _status, ...thread }) => {
    void _status;
    return thread;
  }),
  mustPayOffObligations: spine.mustPayOffObligations.map(
    ({ status: _status, ...obligation }) => {
      void _status;
      return obligation;
    },
  ),
});

/**
 * A client may return an evolved session, but it may not replace the creator's
 * scenario, drives, style, or immutable story-spine definitions and then
 * self-sign the altered payload with a fresh public hash.
 */
export const assertStorySessionScenarioAuthority = ({
  session,
  scenario,
}: {
  session: StorySession;
  scenario: StoryScenario;
}): void => {
  const serverAuthority = {
    scenarioId: scenario.id,
    worldPackId: scenario.worldPackId,
    worldPackVersion: scenario.worldPackVersion,
    focalEntityId: scenario.focalEntityId,
    baseCanonHash: scenario.baseCanonHash,
    baseStateHash: scenario.baseStateHash,
    characterDrives: scenario.characterDrives,
    styleProfile: scenario.styleProfile,
    spine: storySpineAuthorityView(scenario.spine),
  };
  const submittedAuthority = {
    scenarioId: session.scenarioId,
    worldPackId: session.worldPackId,
    worldPackVersion: session.worldPackVersion,
    focalEntityId: session.focalEntityId,
    baseCanonHash: session.ledger.cursor.baseCanonHash,
    baseStateHash: session.ledger.cursor.baseStateHash,
    characterDrives: session.characterDrives,
    styleProfile: session.styleProfile,
    spine: storySpineAuthorityView(session.spine),
  };
  const impossibleCursor =
    session.currentSceneNumber !== session.spine.currentBeat ||
    session.currentSceneNumber > scenario.spine.maximumSceneCount;
  if (
    impossibleCursor ||
    sha256Canonical(submittedAuthority) !== sha256Canonical(serverAuthority)
  ) {
    throw new StoryPresentationError("story_session_authority_mismatch");
  }
};

export const storyStyleProfileView = (style: StoryStyleProfile) => ({
  id: style.styleProfileId,
  label: style.label,
  constraints: [
    {
      id: "viewpoint",
      label: "Viewpoint",
      value: `${style.pointOfView.replaceAll("_", " ")} · ${style.tense}`,
      checkMode: "creator_review" as const,
    },
    {
      id: "rhythm",
      label: "Rhythm",
      value: style.rhythm,
      checkMode: "creator_review" as const,
    },
    {
      id: "subtext",
      label: "Dialogue & subtext",
      value: style.dialogueAndSubtext,
      checkMode: "creator_review" as const,
    },
    {
      id: "images",
      label: "Recurring images",
      value: style.recurringImages.join(" · "),
      checkMode: "creator_review" as const,
    },
    {
      id: "avoid",
      label: "Avoid",
      value: style.forbiddenHabits.join(" · "),
      checkMode: "creator_review" as const,
    },
  ],
});
