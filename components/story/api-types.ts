import type { CausalEffect } from "@/src/contracts/campaign";
import type {
  StartStorySessionApiRequest as CoreStartStorySessionApiRequest,
  StoryPresentationTransport,
  StoryTurnApiRequest as CoreStoryTurnApiRequest,
} from "@/src/contracts/story-api";
import type {
  CharacterDrive,
  StoryModelTrace,
  StoryScene,
  StorySessionBootstrap,
  StoryTurnResult,
} from "@/src/contracts/story";

export const STORY_LIVE_TOKEN_HEADER = "x-penelope-story-token" as const;

export type {
  StartStorySessionRequest,
  StoryChoice,
  StoryModelTrace,
  StorySession,
  StorySessionBootstrap,
  StoryTurnResult,
} from "@/src/contracts/story";

export type StoryApiError = {
  error?: string | { message?: string; code?: string };
};

export type StoryChangeTone = "benefit" | "cost" | "knowledge" | "progress" | "debt";

export type StoryTransportSelection = StoryPresentationTransport;

export type StoryStyleProfileView = {
  id: string;
  label: string;
  constraints: Array<{
    id: string;
    label: string;
    value: string;
    checkMode: "deterministic" | "creator_review";
  }>;
};

export type StoryChangeView = {
  id: string;
  label: string;
  value?: string;
  tone: StoryChangeTone;
};

export type StorySceneView = {
  id: string;
  number: number;
  title: string;
  prose: string;
  focalCharacter: string;
  closingPressure: string;
  echoedEffectIds: string[];
  whatChanged: StoryChangeView[];
  inheritedChoice?: string;
  causalSummary: string;
  claimRefs: string[];
  effectRefs: string[];
  openDebtRefs: string[];
  characterDrives: CharacterDrive[];
  stateHash?: string;
  trace: StoryModelTrace | null;
  source: "opening" | "turn";
};

export type StoryTurnViewSource = {
  result: StoryTurnApiResult;
  effects: CausalEffect[];
};

export type StartStorySessionApiRequest = CoreStartStorySessionApiRequest;

export type StorySessionApi = StorySessionBootstrap & {
  transport: StoryTransportSelection;
  openingTrace: StoryModelTrace | null;
  styleProfile: StoryStyleProfileView;
};
export type StoryTurnApiRequest = CoreStoryTurnApiRequest;
export type StoryTurnApiResult = Omit<StoryTurnResult, "knowledgeScope"> & {
  scopeReceipt: {
    allowedClaimIds: string[];
    scopeHash: string;
  };
};
export type StorySceneApi = StoryScene;
