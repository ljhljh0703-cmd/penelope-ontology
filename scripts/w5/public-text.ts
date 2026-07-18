const englishTokens = (text: string): string[] =>
  text.toLocaleLowerCase("en-US").match(/[a-z0-9]+(?:'[a-z0-9]+)*/gu) ?? [];

const includesTokenSequence = (
  source: readonly string[],
  candidate: readonly string[],
): boolean => {
  if (candidate.length === 0 || candidate.length > source.length) return false;
  return source.some((_, start) =>
    candidate.every((token, offset) => source[start + offset] === token),
  );
};

/**
 * Public summaries are creator-approved analysis, never a transport for the
 * captured prose. Three-word exact summaries and every six-word excerpt are
 * checked after case/punctuation normalization.
 */
export const assertW5PublicTextDoesNotQuoteCapturedProse = ({
  publicTexts,
  capturedProse,
}: {
  publicTexts: readonly string[];
  capturedProse: readonly string[];
}): void => {
  const proseTokens = capturedProse.map(englishTokens);
  for (const publicText of publicTexts) {
    const tokens = englishTokens(publicText);
    if (
      tokens.length >= 3 &&
      proseTokens.some((prose) => includesTokenSequence(prose, tokens))
    ) {
      throw new Error("w5_public_creator_text_quotes_captured_prose");
    }
    for (let start = 0; start + 6 <= tokens.length; start += 1) {
      const excerpt = tokens.slice(start, start + 6);
      if (proseTokens.some((prose) => includesTokenSequence(prose, excerpt))) {
        throw new Error("w5_public_creator_text_quotes_captured_prose");
      }
    }
  }
};
