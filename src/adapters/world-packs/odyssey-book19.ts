import {
  sealPenelopeWorldPack,
  type PenelopeWorldPackV1,
} from "@/src/contracts/penelope-world-pack";
import { getOdysseyBook19WorldSimulation } from "@/src/adapters/fixtures/odyssey-world-simulation";

/**
 * The public, source-grounded demonstration pack.  The runtime must treat
 * every identifier and sentence below as pack data rather than a special case
 * for Homeric material.
 */
const ODYSSEY_BOOK_19_WORLD_PACK = sealPenelopeWorldPack({
  format: "penelope_world_pack",
  schemaVersion: 1,
  packId: "pack.odyssey_book_19.night_of_the_scar",
  packVersion: "1.0.0",
  provenance: {
    kind: "public_domain",
    sourceTitle: "Homer, Odyssey",
    sourceEdition: "Perseus Digital Library, Books 19 and 23",
    sourceUrl:
      "https://www.perseus.tufts.edu/hopper/text?doc=Perseus%3Atext%3A1999.01.0136%3Abook%3D19",
    rightsNote:
      "This pack contains original summaries of public-domain source material, not translated source passages.",
    sourceStatus: "source_checked",
  },
  presentation: {
    publicTitle: "The Night of the Scar",
    publicSubtitle: "A bounded Odyssey simulation · Book 19",
    hook: "The myth, then the IF",
    sourceEyebrow: "A bounded Odyssey simulation · Book 19",
    sourceIntroduction:
      "Ten years after Troy, Odysseus reaches Ithaca disguised as a stranger. Penelope questions him inside a house occupied by hostile suitors. In Book 19, the nurse Eurycleia recognizes him by a scar while Penelope still lacks certainty.",
    productThesis:
      "Penelope does not continue your sentence. It continues your world.",
    participantSummary:
      "At the Ithacan hearth, Penelope questions a guarded stranger while an old nurse and a hostile servant act on different fragments of the truth.",
    guidedCreatorMove: {
      actionText:
        "Penelope asks Melantho to leave before she questions the stranger.",
      helperText:
        "What if Penelope removes a witness before the washing? Test the idea. The excluded character keeps her own motive, moves offstage, and can return as a consequence—not as a prompt improvisation.",
      forkBeforeAction: true,
    },
    defaultLocale: "en",
    availableLocales: ["en"],
    demoOrder: 1,
  },
  creatorInput: {
    recommendedActionPolicies: [
      {
        whenFlagId: "flag.scar_exposed",
        whenFlagValue: false,
        actionIds: [
          "action.penelope.test_testimony",
          "action.penelope.order_washing",
          "action.penelope.observe",
        ],
      },
      {
        whenFlagId: "flag.scar_exposed",
        whenFlagValue: true,
        actionIds: [
          "action.penelope.confront_privately",
          "action.penelope.observe",
          "action.penelope.clear_room",
        ],
      },
    ],
    actionVocabulary: [
      {
        actionId: "action.penelope.observe",
        creatorFacingLabel: "Observe without intervening",
        cueTerms: [
          "observe",
          "watch",
          "wait",
          "study",
          "hold back",
          "stay silent",
          "attention",
        ],
        praise:
          "You are turning restraint into an active choice: Penelope protects what she does not yet know while allowing the other agendas in the room to move.",
      },
      {
        actionId: "action.penelope.test_testimony",
        creatorFacingLabel: "Test the stranger's testimony",
        cueTerms: [
          "test",
          "proof",
          "evidence",
          "truth",
          "lie",
          "trust",
          "question",
          "detail",
          "certainty",
        ],
        praise:
          "You have separated what Penelope wants to learn from what she can honestly know. That keeps the test useful without granting certainty for free.",
      },
      {
        actionId: "action.penelope.order_washing",
        creatorFacingLabel: "Order the foot washing",
        cueTerms: [
          "wash",
          "washing",
          "basin",
          "feet",
          "foot",
          "scar",
          "nurse",
          "household memory",
        ],
        praise:
          "You have tied Penelope's aim to an existing household ritual. The answer can emerge through Eurycleia's memory instead of an unexplained revelation.",
      },
      {
        actionId: "action.penelope.clear_room",
        creatorFacingLabel: "Dismiss a witness",
        cueTerms: [
          "melantho",
          "dismiss",
          "leave",
          "send away",
          "clear the room",
          "private",
          "privacy",
          "witness",
          "overhear",
          "exclude",
        ],
        praise:
          "You are buying privacy by creating a visible exclusion. That gives Penelope control now and gives Melantho a reason to react later.",
      },
      {
        actionId: "action.penelope.confront_privately",
        creatorFacingLabel: "Confront the stranger privately",
        cueTerms: [
          "confront",
          "identity",
          "odysseus",
          "ask directly",
          "name him",
          "reveal",
          "admit",
        ],
        praise:
          "You have chosen direct knowledge over concealment and accepted that the question itself may expose the secret. That makes the revelation costly.",
      },
    ],
    tacitKnowledgePrompts: {
      desiredOutcome:
        "If this works, what should Penelope gain, protect, or change?",
      characterMotive:
        "Why does Penelope choose this now, instead of waiting or taking one of the prepared routes?",
      acceptedCost:
        "What consequence is Penelope willing to risk if this draws attention or fails?",
    },
    unsupportedMechanisms: [
      {
        cueTerms: ["magic", "magical", "spell", "enchanted"],
        explanation:
          "The current world has no registered magical power, spell, or enchanted object that can produce this result.",
      },
      {
        cueTerms: ["mirror"],
        explanation:
          "The current world has no registered mirror that can reveal identity or hidden knowledge.",
      },
      {
        cueTerms: ["zeus", "athena", "poseidon", "god", "goddess"],
        explanation:
          "The current world has no registered action that lets Penelope command a god or turn divine intervention into a guaranteed result.",
      },
      {
        cueTerms: ["teleport", "resurrect", "time travel", "fly the palace"],
        explanation:
          "The current world has no premise or causal rule that supports this mechanism.",
      },
    ],
    expansionPrompt:
      "Do you want to pursue the same aim through evidence already present in Ithaca, or author a new world fact with a history, limit, and cost?",
  },
  identityPolicy: {
    actorAliases: [
      {
        entityId: "entity.odysseus",
        modelFacingEntityId: "entity.stranger",
        renderText: "the stranger",
      },
    ],
    hiddenKnowledge: [
      {
        premiseId: "premise.stranger_identity",
        privateKnowledgeId: "private.stranger_identity",
        withheldPremiseIds: [
          "premise.stranger_identity",
          "premise.scar_recognition",
          "premise.penelope_bounded_evidence",
          "premise.penelope_not_certain",
          "premise.eurycleia_loyalty",
        ],
        forbiddenPatterns: [
          "the stranger is Odysseus",
          "the stranger was Odysseus",
          "Odysseus in disguise",
          "Ulysses in disguise",
        ],
      },
    ],
    creatorMayInspectHiddenState: true,
  },
  worldCodex: {
    dramaticQuestion:
      "Can Penelope identify the stranger without letting the hostile household discover what she knows?",
    relationships: [
      {
        id: "relationship.penelope.odysseus.marriage",
        subjectEntityId: "entity.penelope",
        objectEntityId: "entity.odysseus",
        axisId: "marriage",
        label: "married to",
        direction: "mutual",
        provenance: "source_grounded",
        summary:
          "Penelope and Odysseus are spouses, but his disguise keeps that bond from becoming usable knowledge for her at the opening.",
      },
      {
        id: "relationship.eurycleia.odysseus.nurse",
        subjectEntityId: "entity.eurycleia",
        objectEntityId: "entity.odysseus",
        axisId: "raised",
        label: "raised",
        direction: "directed",
        provenance: "source_grounded",
        summary:
          "Eurycleia nursed Odysseus and can connect the scar to a memory the other household members do not share.",
      },
      {
        id: "relationship.penelope.eurycleia.household_trust",
        subjectEntityId: "entity.penelope",
        objectEntityId: "entity.eurycleia",
        axisId: "household_trust",
        label: "entrusts household duties to",
        direction: "directed",
        provenance: "source_grounded",
        summary:
          "Penelope can direct Eurycleia within the household, while the nurse keeps an independent memory and duty toward Odysseus.",
      },
      {
        id: "relationship.melantho.penelope.hostility",
        subjectEntityId: "entity.melantho",
        objectEntityId: "entity.penelope",
        axisId: "hostility",
        label: "resents and watches",
        direction: "directed",
        provenance: "source_grounded",
        summary:
          "Melantho serves in Penelope's household but aligns herself with the suitor faction and treats secrecy as a reason to investigate.",
      },
    ],
  },
  renderPolicy: {
    tense: "present",
    pointOfView: "limited_third",
    sceneModes: ["setup", "pressure", "revelation", "aftermath", "ending"],
    prohibitedTerms: [
      "evidence",
      "suspicion",
      "knowledge",
      "state",
      "system",
      "engine",
      "risk",
      "narrative",
      "world model",
    ],
    openingEvent: {
      eventId: "event.opening.hearth_interview",
      source: { kind: "world", reactionRuleId: "reaction.opening" },
      actionId: "action.opening",
      summary:
        "Penelope keeps the late interview at the hearth, with the stranger before her, Eurycleia attending, and Melantho close enough to become a risk.",
      effects: [],
      visibleToEntityIds: ["entity.penelope"],
    },
    unsupportedActionText:
      "Nothing in the room answers Penelope's attempt. No one acts on it, and nothing shifts in her favor. The moment passes, and the night moves on.",
    zoneActiveText: "The interview remains beside the hearth.",
    zoneCompleteText: "The interview ends beside the hearth.",
    actorRenderTextById: {
      "entity.penelope": "Penelope sits beside the hearth.",
      "entity.odysseus": "The stranger sits before her.",
      "entity.eurycleia": "Eurycleia waits nearby.",
      "entity.melantho": "Melantho watches from the inner corridor.",
    },
    registeredEventTextByActionId: {
      "action.opening": "The household gathers around the hearth.",
      "action.penelope.observe": "Penelope waits and watches the room.",
      "action.penelope.test_testimony": "Penelope tests the stranger's account.",
      "action.penelope.order_washing": "Penelope orders Eurycleia to begin.",
      "action.penelope.clear_room": "Penelope clears the nearby servants.",
      "action.penelope.confront_privately":
        "Penelope asks whether the stranger is Odysseus.",
      "action.odysseus.answer_carefully": "The stranger answers Penelope with care.",
      "action.odysseus.contain_recognition": "The stranger checks Eurycleia's alarm.",
      "action.eurycleia.wash_feet": "Eurycleia stops at the old scar.",
      "action.eurycleia.guard_secret": "Eurycleia keeps the moment private.",
      "action.eurycleia.confirm_privately":
        "Eurycleia identifies the stranger as Odysseus.",
      "action.melantho.investigate": "Melantho watches the visible disturbance.",
    },
    currentEventTextByActionId: {
      "action.opening": "Penelope questions the stranger beside the hearth.",
      "action.penelope.order_washing": "Penelope asks Eurycleia to wash his feet.",
      "action.penelope.clear_room": "Penelope sends Melantho out of earshot.",
      "action.odysseus.contain_recognition":
        "The stranger stops Eurycleia before she speaks.",
    },
    currentReactionTextByRuleId: {
      "reaction.eurycleia.recognize_scar":
        "Eurycleia stops when she sees the scar.",
      "reaction.odysseus.contain_recognition":
        "The stranger stops Eurycleia before she speaks.",
      "reaction.odysseus.answer_testimony": "The stranger answers Penelope with care.",
      "reaction.eurycleia.controlled_disclosure":
        "Eurycleia identifies the stranger as Odysseus.",
      "reaction.melantho.notice_exclusion":
        "Melantho leaves, but looks back at Penelope.",
      "reaction.melantho.approach_on_observe": "Melantho draws near and listens.",
      "reaction.melantho.compromise_plan":
        "Melantho sees Eurycleia's shock and calls help.",
    },
    currentTurnConsequenceTextByActionId: {
      "action.penelope.observe": "The pause gives Melantho room to listen.",
      "action.penelope.test_testimony": "Penelope has evidence, but not certainty.",
      "action.penelope.order_washing":
        "The washing brings old memory near.",
      "action.penelope.clear_room": "Melantho is now outside the interview.",
      "action.penelope.confront_privately":
        "Penelope risks exposure for an answer.",
    },
    registeredEndingTextById: {
      "ending.canon_contained":
        "Recognition stays contained; Penelope remains uncertain.",
      "ending.controlled_discovery":
        "The confirmation stays inside the closed room.",
      "ending.plan_compromised":
        "The disturbance escapes and raises immediate danger.",
      "ending.timeout": "Night closes; the unresolved consequences remain.",
    },
    currentEndingTextById: {
      "ending.canon_contained":
        "Eurycleia keeps silent while Penelope remains uncertain.",
      "ending.controlled_discovery": "Penelope learns the truth in private.",
      "ending.plan_compromised":
        "Melantho carries word toward the suitor faction.",
      "ending.timeout": "Night ends before Penelope reaches an answer.",
    },
    participantEndingTextByKind: {
      canon_contained:
        "The immediate disturbance settles without giving Penelope a final answer.",
      controlled_discovery:
        "Penelope reaches a private conclusion while the wider household remains outside it.",
      plan_compromised:
        "A visible disturbance reaches the hostile household network and forces a riskier timetable.",
      timeout:
        "The night closes with unresolved knowledge and every visible consequence preserved.",
    },
    lockedEventTextByActionId: {
      "action.penelope.confront_privately": "Penelope questions the stranger in private.",
    },
    criticalFlagIds: ["flag.plan_compromised"],
    setupStopActorId: "entity.eurycleia",
    endingStopActorId: "entity.odysseus",
  },
  scenario: getOdysseyBook19WorldSimulation(),
});

/** A new session receives a detached sealed copy, never shared mutable pack data. */
export const getOdysseyBook19WorldPack = (): PenelopeWorldPackV1 =>
  structuredClone(ODYSSEY_BOOK_19_WORLD_PACK);
