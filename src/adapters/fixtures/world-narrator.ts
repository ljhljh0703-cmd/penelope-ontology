import {
  WorldNarrationRequestSchema,
  validateWorldNarration,
  countEnglishSceneWords,
  type WorldNarrationRequest,
  type WorldNarrationSegment,
} from "@/src/contracts/world-narrator";
import type { WorldNarrator } from "@/src/ports/world-narrator";

const FIXTURE_ADAPTER_ID = "world_narrator_fixture_v1";

const words = (text: string): Array<string> => text.trim().split(/\s+/u);

const clipWords = (text: string, maximum: number): string => {
  const tokens = words(text);
  if (tokens.length <= maximum) return text.trim();
  return `${tokens.slice(0, maximum).join(" ").replace(/[,:;.!?]+$/u, "")}...`;
};

const fixtureTitle = (request: WorldNarrationRequest): string => {
  const resolved = request.resolvedEvents
    .map(({ summary }) => summary)
    .join(" ")
    .toLocaleLowerCase("en-US");
  if (/scar|wash|basin/u.test(resolved)) return "The Basin Between Them";
  if (/confront|confirm|private/u.test(resolved)) {
    return "The Question Inside the Circle";
  }
  if (/melantho|witness|servant|notice/u.test(resolved)) {
    return "A Witness Near the Hearth";
  }
  if (/testimony|question|evidence/u.test(resolved)) {
    return "What the Stranger Can Prove";
  }
  return request.previousVisibleSceneSummary === null
    ? "A Stranger at the Hearth"
    : "Before Penelope Chooses";
};

const naturalList = (values: string[]): string => {
  if (values.length === 0) return "no offered course";
  if (values.length === 1) return values[0]!;
  return `${values.slice(0, -1).join(", ")}, or ${values.at(-1)}`;
};

const createFixtureNarration = (request: WorldNarrationRequest) => {
  const observable = request.observableFacts.slice(0, 2);
  const known = request.focalKnowledge.slice(0, 1);
  const groundedFactIds = [
    ...observable.map(({ factId }) => factId),
    ...known.map(({ factId }) => factId),
  ];

  const evidenceSegment: WorldNarrationSegment = {
    segmentId: "world_segment_evidence",
    text: [
      ...observable.map(({ summary }) => clipWords(summary, 15)),
      "Penelope holds to what the room can show her, resisting every conclusion that the visible evidence has not earned.",
    ].join(" "),
    grounding: {
      factIds: groundedFactIds,
      eventIds: [],
    },
  };

  const continuitySegment: WorldNarrationSegment = {
    segmentId: "world_segment_continuity",
    text: [
      request.previousVisibleSceneSummary === null
        ? "No earlier conclusion settles the encounter; the late hour only makes each pause more costly."
        : `The last visible moment still presses on the room: ${clipWords(request.previousVisibleSceneSummary, 12)}`,
      known.length > 0
        ? `She carries only this much forward: ${clipWords(known[0]!.summary, 14)}`
        : "She carries no private answer beyond what has already become visible.",
    ].join(" "),
    grounding: {
      factIds: [],
      eventIds: [],
    },
  };

  const eventWordBudget = Math.max(
    5,
    Math.floor(48 / request.resolvedEvents.length),
  );
  const eventClauses = request.resolvedEvents.map((event) =>
    clipWords(event.summary, eventWordBudget),
  );
  const eventSegment: WorldNarrationSegment = {
    segmentId: "world_segment_resolved_events",
    text: eventClauses.join(" "),
    grounding: {
      factIds: [],
      eventIds: request.resolvedEvents.map(({ eventId }) => eventId),
    },
  };

  const padding = [
    "Silence has become an action of its own, giving every other will in the household room to move.",
    "A servant's glance, a halted hand, or one answer spoken too quickly could change who controls the next moment.",
    "Penelope therefore measures not only what was done, but who had reason to notice it.",
    "The household remains dangerous precisely because uncertainty does not keep its people still.",
    "Whatever follows must begin from these consequences rather than erase them for a cleaner scene.",
  ];
  const offeredChoices = request.nextActionCandidates.map(({ label }) =>
    label.replace(/[.!?]+$/u, ""),
  );
  let handoffText = [
    "Nothing beyond these consequences is settled for her.",
    offeredChoices.length > 0
      ? `Her remaining courses are concrete: ${naturalList(offeredChoices)}.`
      : "The bounded scene has reached the point where no further action is offered.",
    "The moment stops before the next choice, leaving its cost to the person who makes it.",
  ].join(" ");
  const segments = [evidenceSegment, continuitySegment, eventSegment];
  let prose = [...segments.map(({ text }) => text), handoffText].join("\n\n");
  for (const sentence of padding) {
    if (countEnglishSceneWords(prose) >= 120) break;
    const candidate = `${handoffText} ${sentence}`;
    const candidateProse = [
      ...segments.map(({ text }) => text),
      candidate,
    ].join("\n\n");
    if (countEnglishSceneWords(candidateProse) > 180) break;
    handoffText = candidate;
    prose = candidateProse;
  }

  const handoffSegment: WorldNarrationSegment = {
    segmentId: "world_segment_handoff",
    text: handoffText,
    grounding: {
      factIds: [],
      eventIds: [],
    },
  };
  const finalSegments = [...segments, handoffSegment];

  return {
    title: fixtureTitle(request),
    prose: finalSegments.map(({ text }) => text).join("\n\n"),
    segments: finalSegments,
    grounding: {
      factIds: groundedFactIds,
      eventIds: request.resolvedEvents.map(({ eventId }) => eventId),
    },
    nextActions: request.nextActionCandidates.map((action) => ({ ...action })),
  };
};

export const fixtureWorldNarrator: WorldNarrator = {
  async narrate(requestInput) {
    const request = WorldNarrationRequestSchema.safeParse(requestInput);
    if (!request.success) {
      return {
        outcome: "rejected",
        error: {
          code: "world_narration_request_invalid",
          message:
            request.error.issues[0]?.message ??
            "The world narration request is invalid.",
        },
        trace: {
          provenance: "fixture",
          adapterId: FIXTURE_ADAPTER_ID,
        },
      };
    }

    const narration = createFixtureNarration(request.data);
    const validation = validateWorldNarration({
      request: request.data,
      narration,
    });
    if (!validation.ok) {
      return {
        outcome: "rejected",
        error: {
          code: `world_narration_${validation.code}`,
          message: validation.message,
        },
        trace: {
          provenance: "fixture",
          adapterId: FIXTURE_ADAPTER_ID,
        },
      };
    }

    return {
      outcome: "completed",
      narration: validation.narration,
      trace: {
        provenance: "fixture",
        adapterId: FIXTURE_ADAPTER_ID,
      },
    };
  },
};
