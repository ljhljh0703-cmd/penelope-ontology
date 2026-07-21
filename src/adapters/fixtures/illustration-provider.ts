import {
  FATE_FRAME_HEIGHT,
  FATE_FRAME_WIDTH,
  IllustrationSourceGridSchema,
  VisualMomentRequestSchema,
} from "@/src/contracts/visual-moment";
import { sha256Canonical } from "@/src/domain/canonical-json";
import type { IllustrationProvider } from "@/src/ports/illustration-provider";

const ADAPTER_ID = "penelope_fate_frame_fixture_v1";

const clampByte = (value: number): number =>
  Math.max(0, Math.min(255, Math.round(value)));

const distanceToLine = (
  x: number,
  y: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): number => {
  const dx = endX - startX;
  const dy = endY - startY;
  const magnitude = dx * dx + dy * dy;
  if (magnitude === 0) return Math.hypot(x - startX, y - startY);
  const progress = Math.max(
    0,
    Math.min(1, ((x - startX) * dx + (y - startY) * dy) / magnitude),
  );
  return Math.hypot(x - (startX + progress * dx), y - (startY + progress * dy));
};

const requestEntropy = (digest: string, index: number): number =>
  Number.parseInt(digest.slice((index * 2) % 60, (index * 2) % 60 + 2), 16) / 255;

const fixturePixels = (digest: string): number[] => {
  const pixels: number[] = [];
  const originX = FATE_FRAME_WIDTH * 0.48;
  const originY = FATE_FRAME_HEIGHT * 0.88;
  const leftEndX = FATE_FRAME_WIDTH * (0.18 + requestEntropy(digest, 1) * 0.08);
  const rightEndX = FATE_FRAME_WIDTH * (0.72 + requestEntropy(digest, 2) * 0.09);
  const endY = FATE_FRAME_HEIGHT * (0.18 + requestEntropy(digest, 3) * 0.08);

  for (let y = 0; y < FATE_FRAME_HEIGHT; y += 1) {
    for (let x = 0; x < FATE_FRAME_WIDTH; x += 1) {
      const normalizedY = y / (FATE_FRAME_HEIGHT - 1);
      const vignette = Math.hypot(
        (x - FATE_FRAME_WIDTH / 2) / FATE_FRAME_WIDTH,
        (y - FATE_FRAME_HEIGHT / 2) / FATE_FRAME_HEIGHT,
      );
      const grain = (requestEntropy(digest, x + y * FATE_FRAME_WIDTH) - 0.5) * 24;
      const leftPath = distanceToLine(x, y, originX, originY, leftEndX, endY);
      const rightPath = distanceToLine(x, y, originX, originY, rightEndX, endY);
      const pathLight = Math.max(0, 1 - Math.min(leftPath, rightPath) / 2.1) * 145;
      const head = Math.hypot(x - originX, y - FATE_FRAME_HEIGHT * 0.55) < 2.2;
      const body =
        Math.abs(x - originX) < 2.8 &&
        y > FATE_FRAME_HEIGHT * 0.61 &&
        y < FATE_FRAME_HEIGHT * 0.84;
      const figureLight = head || body ? 190 : 0;
      const horizon = Math.abs(y - FATE_FRAME_HEIGHT * 0.34) < 0.7 ? 46 : 0;
      const base = 34 + (1 - normalizedY) * 22 - vignette * 38;
      pixels.push(clampByte(base + grain + pathLight + figureLight + horizon));
    }
  }
  return pixels;
};

export const fixtureIllustrationProvider: IllustrationProvider = {
  async createSource(requestInput) {
    const request = VisualMomentRequestSchema.parse(requestInput);
    const requestDigest = sha256Canonical(request);
    const pixels = fixturePixels(requestDigest);
    const latestVisibleEvent = request.visibleEvents.at(-1)!;
    const altText = `A symbolic limited-color branch frame for ${request.sceneTitle}: ${latestVisibleEvent.summary}`;
    const source = IllustrationSourceGridSchema.parse({
      width: FATE_FRAME_WIDTH,
      height: FATE_FRAME_HEIGHT,
      pixels,
      sourceHash: sha256Canonical({
        schemaVersion: "penelope.fixture-illustration-source.v1",
        requestDigest,
        pixels,
      }),
      altText,
    });
    return {
      source,
      trace: { provenance: "fixture", adapterId: ADAPTER_ID },
    };
  },
};
