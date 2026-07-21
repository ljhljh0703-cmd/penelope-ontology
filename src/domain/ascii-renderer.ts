import {
  AsciiFrameSchema,
  IllustrationSourceGridSchema,
  LimitedPaletteColorSchema,
  type AsciiFrame,
  type IllustrationSourceGrid,
} from "@/src/contracts/visual-moment";
import { sha256Canonical } from "@/src/domain/canonical-json";

const GLYPH_RAMP = " .:-=+*#%@";
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));

export const renderLimitedColorAscii = ({
  source: sourceInput,
  palette: paletteInput,
}: {
  source: IllustrationSourceGrid;
  palette: string[];
}): AsciiFrame => {
  const source = IllustrationSourceGridSchema.parse(sourceInput);
  const palette = LimitedPaletteColorSchema.array().min(3).max(5).parse(paletteInput);
  const glyphRows: string[] = [];
  const colorRows: string[] = [];

  for (let y = 0; y < source.height; y += 1) {
    let glyphRow = "";
    let colorRow = "";
    for (let x = 0; x < source.width; x += 1) {
      const pixel = source.pixels[y * source.width + x]! / 255;
      const threshold = (BAYER_4X4[y % 4]![x % 4]! + 0.5) / 16 - 0.5;
      const adjusted = clampUnit(pixel + threshold * 0.12);
      const glyphIndex = Math.min(
        GLYPH_RAMP.length - 1,
        Math.floor(adjusted * GLYPH_RAMP.length),
      );
      const colorIndex = Math.min(
        palette.length - 1,
        Math.floor(adjusted * palette.length),
      );
      glyphRow += GLYPH_RAMP[glyphIndex]!;
      colorRow += String(colorIndex);
    }
    glyphRows.push(glyphRow);
    colorRows.push(colorRow);
  }

  const renderPayload = {
    format: "limited_color_ascii_v1" as const,
    width: source.width,
    height: source.height,
    palette,
    glyphRows,
    colorRows,
    sourceHash: source.sourceHash,
    altText: source.altText,
  };
  return AsciiFrameSchema.parse({
    ...renderPayload,
    renderHash: sha256Canonical(renderPayload),
  });
};
