import type {
  StoryModelOutcome,
  StoryModelRequest,
} from "@/src/contracts/story";

export interface StoryModel {
  generate(request: StoryModelRequest): Promise<StoryModelOutcome>;
}
