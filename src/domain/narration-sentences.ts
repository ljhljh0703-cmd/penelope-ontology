const LOWERCASE_DIALOGUE_ATTRIBUTION =
  /^(?:he|she|they|i|we|you)\s+(?:asks?|answers?|replies?|says?|tells?|whispers?|shouts?|calls?|adds?|continues?)\b/u;

/**
 * Splits English narration for plan coverage and length checks while keeping a
 * lower-case dialogue attribution with the quoted sentence it belongs to.
 */
export const splitNarrationSentences = (text: string): string[] => {
  const segments = text
    .replace(/([.!?])([”"'])\s+/gu, "$1$2\n")
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const merged: string[] = [];
  for (const segment of segments) {
    const previous = merged.at(-1);
    if (
      previous !== undefined &&
      /[.!?][”"']$/u.test(previous) &&
      LOWERCASE_DIALOGUE_ATTRIBUTION.test(segment)
    ) {
      merged[merged.length - 1] = `${previous} ${segment}`;
    } else {
      merged.push(segment);
    }
  }
  return merged;
};
