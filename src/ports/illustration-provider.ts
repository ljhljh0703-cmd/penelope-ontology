import type {
  IllustrationSourceGrid,
  VisualMomentRequest,
} from "@/src/contracts/visual-moment";

export type IllustrationProviderResult = {
  source: IllustrationSourceGrid;
  trace: {
    provenance: "fixture";
    adapterId: string;
  };
};

export interface IllustrationProvider {
  createSource(request: VisualMomentRequest): Promise<IllustrationProviderResult>;
}
