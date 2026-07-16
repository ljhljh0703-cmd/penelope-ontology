import type { StoryChoice } from "@/src/contracts/story";

const normalizeIntentText = (value: string): string =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[’‘]/gu, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

const matches = (value: string, pattern: RegExp): boolean => pattern.test(value);

const isNegatedBell = (value: string): boolean =>
  matches(
    value,
    /\b(?:do not|don't|dont|never|without)\b(?:\s+\w+){0,4}\s+\b(?:ring|sound|toll)\b/u,
  ) ||
  matches(
    value,
    /\b(?:keep|leave|hold)\b(?:\s+\w+){0,4}\s+\b(?:bell|alarm)\b(?:\s+\w+){0,3}\s+\b(?:silent|quiet|still)\b/u,
  );

const redSailIntentMatchers: Readonly<
  Record<string, (normalizedAction: string) => boolean>
> = {
  "choice.keep_quiet_watch": (value) =>
    isNegatedBell(value) ||
    (matches(value, /\b(?:quiet|secret|hidden|covert|unseen)\b/u) &&
      matches(value, /\b(?:watch|observe|lookout|lamp|bell)\b/u)) ||
    (matches(value, /\b(?:covered|hidden)\s+lamp\b/u) &&
      matches(value, /\b(?:western|west|wall|watch|observe)\b/u)),
  "choice.ring_public_bell": (value) =>
    (!isNegatedBell(value) &&
      matches(value, /\b(?:ring|sound|toll)\b(?:\s+\w+){0,4}\s+\bbell\b/u)) ||
    matches(
      value,
      /\b(?:raise|sound|give|call|trigger)\b(?:\s+\w+){0,4}\s+\b(?:public\s+)?alarm\b/u,
    ) ||
    matches(
      value,
      /\b(?:assemble|summon|call|muster|gather)\b(?:\s+\w+){0,4}\s+\bguards?\b/u,
    ),
  "choice.move_decoy_lamp": (value) =>
    (matches(
      value,
      /\b(?:move|shift|relocate|carry|take|place|set)\b/u,
    ) &&
      matches(value, /\b(?:lamp|decoy|east\s+gate)\b/u)) ||
    (matches(value, /\b(?:lamp|decoy)\b/u) &&
      matches(value, /\b(?:expose|reveal|test)\b(?:\s+\w+){0,4}\s+\bwatcher\b/u)),
  "choice.sweep_harbor": (value) =>
    (matches(value, /\b(?:sweep|clear|search|secure|patrol)\b/u) &&
      matches(value, /\b(?:harbor|crowd|waterfront|docks?|contact)\b/u)) ||
    matches(
      value,
      /\b(?:drive|force|push)\b(?:\s+\w+){0,4}\s+\bship\b(?:\s+\w+){0,3}\s+\baway\b/u,
    ),
};

/**
 * Resolves only the small, registered Red Sail vocabulary. A contradictory or
 * unsupported action returns null so the caller can preserve fail-forward
 * behavior instead of guessing a branch.
 */
export const findRegisteredStoryIntent = ({
  action,
  candidates,
}: {
  action: string;
  candidates: StoryChoice[];
}): StoryChoice | null => {
  const normalizedAction = normalizeIntentText(action);
  const exact = candidates.filter(
    ({ intent, label }) =>
      normalizeIntentText(intent) === normalizedAction ||
      normalizeIntentText(label) === normalizedAction,
  );
  if (exact.length === 1) return exact[0] ?? null;
  if (exact.length > 1) return null;

  const semantic = candidates.filter(({ choiceId }) =>
    redSailIntentMatchers[choiceId]?.(normalizedAction),
  );
  return semantic.length === 1 ? (semantic[0] ?? null) : null;
};
