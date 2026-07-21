import {
  sealPenelopeWorldPack,
  type PenelopeWorldPackV1,
} from "@/src/contracts/penelope-world-pack";

/**
 * A deliberately small, source-grounded alternate-history pack.  It starts
 * just before Toto reveals the man behind the screen in Chapter XV.  The pack
 * uses only original summaries of the 1900 text; it does not copy its prose.
 */
export const OZ_DISCOVERY_WORLD_PACK: PenelopeWorldPackV1 = sealPenelopeWorldPack({
  format: "penelope_world_pack",
  schemaVersion: 1,
  packId: "pack.oz.discovery_of_the_wizard",
  packVersion: "1.0.0",
  provenance: {
    kind: "public_domain",
    sourceTitle: "The Wonderful Wizard of Oz",
    sourceEdition: "L. Frank Baum, 1900; Project Gutenberg eBook 55",
    sourceUrl: "https://www.gutenberg.org/files/55/55-h/55-h.htm",
    rightsNote:
      "This pack records original summaries of a public-domain source and excludes its prose.",
    sourceStatus: "source_checked",
  },
  presentation: {
    publicTitle: "Behind the Green Screen",
    publicSubtitle: "A two-turn Oz rehearsal",
    hook:
      "Four travelers have seen four different rulers. One small disruption can decide whether the illusion survives.",
    sourceEyebrow: "The Wonderful Wizard of Oz · Chapter XV",
    sourceIntroduction:
      "Dorothy and her companions demand what the Voice has promised them. The ruler they have each imagined is hidden behind a screen, and Toto is close enough to change the scene.",
    productThesis:
      "The same causal engine can protect a classical source, test a creator-approved alternate choice, and show exactly which consequence changes.",
    participantSummary:
      "Dorothy can expose the illusion, build public pressure first, or keep Toto close and accept the cost of leaving the secret intact.",
    guidedCreatorMove: {
      actionText: "Dorothy keeps Toto at her side.",
      helperText:
        "This creator-approved IF preserves the screen, but lets the Voice keep delaying the group.",
      forkBeforeAction: true,
    },
    defaultLocale: "en",
    availableLocales: ["en"],
    demoOrder: 2,
  },
  creatorInput: {
    recommendedActionPolicies: [
      {
        whenFlagId: "flag.public_pressure",
        whenFlagValue: false,
        actionIds: [
          "action.dorothy.challenge_voice",
          "action.dorothy.call_lion_roar",
        ],
      },
      {
        whenFlagId: "flag.public_pressure",
        whenFlagValue: true,
        actionIds: ["action.dorothy.call_lion_roar", "action.dorothy.restrain_toto"],
      },
    ],
    actionVocabulary: [
      {
        actionId: "action.dorothy.challenge_voice",
        creatorFacingLabel: "Compare the conflicting appearances",
        cueTerms: ["compare appearances", "challenge the voice", "ask companions"],
        praise:
          "You turn conflicting testimony into pressure without inventing a new fact for the world.",
      },
      {
        actionId: "action.dorothy.call_lion_roar",
        creatorFacingLabel: "Ask the Lion to roar",
        cueTerms: ["ask lion to roar", "call lion roar", "make lion roar"],
        praise:
          "You use a declared disruption and accept that an unseen character may answer it first.",
      },
      {
        actionId: "action.dorothy.restrain_toto",
        creatorFacingLabel: "Keep Toto beside Dorothy",
        cueTerms: [
          "hold toto",
          "restrain toto",
          "keep toto close",
          "keeps toto at her side",
        ],
        praise:
          "You change one physical condition openly, then let the world calculate what that protection costs.",
      },
    ],
    tacitKnowledgePrompts: {
      desiredOutcome:
        "What must Dorothy gain before she risks breaking the Voice's control of the room?",
      characterMotive:
        "Why does Dorothy choose pressure, caution, or a public test at this exact moment?",
      acceptedCost:
        "If the screen stays upright, what delay or uncertainty is Dorothy willing to accept?",
    },
    unsupportedMechanisms: [
      {
        cueTerms: ["ruby slippers", "ruby shoes"],
        explanation:
          "This 1900 book pack uses the silver shoes named in its checked source. Ruby shoes belong to a later screen adaptation and are not a registered fact here.",
      },
    ],
    expansionPrompt:
      "If the desired change needs a fact not in this pack, propose it as a creator review item instead of silently adding it to Oz.",
  },
  identityPolicy: {
    actorAliases: [
      {
        entityId: "entity.wizard",
        modelFacingEntityId: "entity.voice",
        renderText: "the disembodied Voice behind the screen",
      },
    ],
    hiddenKnowledge: [
      {
        premiseId: "premise.wizard_behind_screen",
        privateKnowledgeId: "private.wizard_behind_screen",
        withheldPremiseIds: [
          "premise.wizard_behind_screen",
          "premise.toto_topples_screen",
        ],
        forbiddenPatterns: ["the Wizard is a humbug", "man behind the screen"],
      },
    ],
    creatorMayInspectHiddenState: true,
  },
  renderPolicy: {
    tense: "present",
    pointOfView: "limited_third",
    sceneModes: ["setup", "pressure", "revelation", "aftermath", "ending"],
    prohibitedTerms: ["canon overlay", "state hash", "ruby slippers", "ruby shoes"],
    openingEvent: {
      eventId: "event.oz.opening_voice",
      source: { kind: "world", reactionRuleId: "reaction.wizard.delay" },
      actionId: "action.wizard.delay",
      summary:
        "The Voice has postponed each traveler twice, while the green screen keeps its ruler out of sight.",
      effects: [],
      visibleToEntityIds: [
        "entity.dorothy",
        "entity.wizard",
        "entity.toto",
        "entity.lion",
      ],
    },
    unsupportedActionText:
      "That move has no declared support in this pack. Keep the source fact intact or submit the change for creator review.",
    zoneActiveText: "The green throne room holds its breath.",
    zoneCompleteText: "The throne-room test reaches its consequence.",
    actorRenderTextById: {
      "entity.dorothy": "Dorothy faces the hidden Voice.",
      "entity.wizard": "The Voice speaks behind the green screen.",
      "entity.toto": "Toto waits at Dorothy's heels.",
      "entity.lion": "The Lion waits beside them.",
    },
    registeredEventTextByActionId: {
      "action.dorothy.challenge_voice":
        "Dorothy asks the group to compare the forms each of them has seen.",
      "action.dorothy.call_lion_roar":
        "Dorothy turns the Lion's roar into a test of the Voice's authority.",
      "action.dorothy.restrain_toto":
        "Dorothy keeps Toto close before the room is shaken.",
      "action.wizard.delay": "The Voice postpones a direct answer.",
      "action.wizard.admit_deception":
        "The exposed man admits the deception.",
      "action.wizard.hold_illusion":
        "The Voice keeps the screen standing.",
      "action.toto.topple_screen": "Toto pulls the screen down.",
      "action.toto.hold_position": "Toto stays beside Dorothy.",
      "action.lion.wait": "The Lion waits for Dorothy's signal.",
    },
    currentEventTextByActionId: {
      "action.wizard.delay": "The Voice postpones the travelers again.",
      "action.dorothy.challenge_voice":
        "Dorothy compares the four conflicting appearances.",
      "action.dorothy.call_lion_roar":
        "Dorothy asks the Lion to roar.",
      "action.dorothy.restrain_toto":
        "Dorothy keeps Toto beside her.",
    },
    currentReactionTextByRuleId: {
      "reaction.wizard.delay":
        "The Voice orders them to wait again.",
      "reaction.toto.topple_screen":
        "Toto pulls the green screen down.",
      "reaction.wizard.admit_deception":
        "The exposed man admits the deception.",
      "reaction.wizard.hold_illusion":
        "The screen stands; the Voice keeps delaying.",
      "reaction.toto.accept_restraint":
        "Toto stays against Dorothy's side.",
    },
    currentTurnConsequenceTextByActionId: {
      "action.dorothy.challenge_voice":
        "Their stories now challenge one authority.",
      "action.dorothy.call_lion_roar":
        "Toto can now reach the screen.",
      "action.dorothy.restrain_toto":
        "Her caution also protects the illusion.",
    },
    registeredEndingTextById: {
      "ending.humbug_exposed":
        "The screen falls, and the Wizard's hidden position becomes public inside the room.",
      "ending.public_pressure_exposure":
        "The screen falls after the travelers have compared their conflicting evidence, making the exposure harder to contain.",
      "ending.illusion_holds":
        "Toto remains restrained; the screen stands; the Voice keeps the promise deferred.",
      "ending.timeout":
        "The short rehearsal ends before the group decides how to force a final answer.",
    },
    currentEndingTextById: {
      "ending.humbug_exposed":
        "A small man stands behind it.",
      "ending.public_pressure_exposure":
        "Their shared suspicion becomes visible proof.",
      "ending.illusion_holds":
        "Dorothy's caution leaves the Voice in control.",
      "ending.timeout":
        "The green screen still stands.",
    },
    participantEndingTextByKind: {
      humbug_exposed: "Dorothy has exposed the hidden operator.",
      public_pressure_exposure: "Dorothy has turned shared evidence into a public exposure.",
      illusion_holds: "Dorothy has chosen control over immediate revelation.",
      timeout: "Dorothy leaves the room with the next pressure point unresolved.",
    },
    lockedEventTextByActionId: {
      "action.dorothy.restrain_toto":
        "The creator IF changes Toto's position, not the source's stated objects or history.",
    },
    criticalFlagIds: ["flag.wizard_exposed", "flag.illusion_holds"],
    setupStopActorId: "entity.dorothy",
    endingStopActorId: "entity.dorothy",
  },
  scenario: {
    id: "scenario.oz.chapter_15.discovery",
    title: "The Discovery of Oz",
    summary:
      "A bounded throne-room simulation tests whether Dorothy exposes the hidden Wizard, raises pressure before the reveal, or prevents Toto from overturning the screen.",
    focalParticipantEntityId: "entity.dorothy",
    maxTurns: 2,
    maxReactionsPerTurn: 2,
    sourceLocators: [
      {
        id: "source.oz.15.gutenberg",
        work: "The Wonderful Wizard of Oz",
        book: "Chapter XV: The Discovery of Oz, the Terrible",
        passage: "The audience, the four appearances, Toto's screen, and the confession",
        url: "https://www.gutenberg.org/files/55/55-h/55-h.htm",
        sourceStatus: "primary_source_checked",
        checkedAt: "2026-07-21",
        evidenceSummary:
          "The chapter places the travelers before an unseen Voice, records their conflicting appearances of Oz, has the Lion roar, lets Toto dislodge the screen, and reveals the man who admits the effects were staged.",
        usage: "original_summary_only",
      },
    ],
    premises: [
      {
        id: "premise.conflicting_appearances",
        summary:
          "Dorothy and her companions have each been shown a different imposing appearance of Oz, so their accounts cannot all describe one visible ruler.",
        textForm: "original_summary",
        origin: { kind: "source", sourceLocatorIds: ["source.oz.15.gutenberg"] },
        meaning:
          "Contradictory testimony is a pressure resource, not proof of what stands behind the screen.",
        recognizerEntityIds: ["entity.dorothy", "entity.lion", "entity.wizard"],
        stakes: [
          {
            id: "stake.shared_suspicion",
            summary:
              "If the travelers compare their accounts, the Voice loses the advantage of keeping each person isolated inside a different spectacle.",
            affectedEntityIds: ["entity.dorothy", "entity.wizard", "entity.lion"],
          },
        ],
        approvalState: "source_verified",
      },
      {
        id: "premise.wizard_behind_screen",
        summary:
          "A small man operates the Voice and its effects from behind the green screen in the throne room.",
        textForm: "original_summary",
        origin: { kind: "source", sourceLocatorIds: ["source.oz.15.gutenberg"] },
        meaning:
          "The hidden operator is a private world fact until the screen falls; narration may not reveal it early.",
        recognizerEntityIds: ["entity.wizard"],
        stakes: [
          {
            id: "stake.illusion_control",
            summary:
              "The screen lets the Wizard delay requests and preserve authority as long as the room cannot inspect the mechanism.",
            affectedEntityIds: ["entity.wizard", "entity.dorothy", "entity.toto"],
          },
        ],
        approvalState: "source_verified",
      },
      {
        id: "premise.toto_topples_screen",
        summary:
          "When the Lion's roar startles the room, Toto reaches the screen and knocks it down, exposing the hidden operator.",
        textForm: "original_summary",
        origin: { kind: "source", sourceLocatorIds: ["source.oz.15.gutenberg"] },
        meaning:
          "A small actor's physical position can decide whether an illusion is tested or protected.",
        recognizerEntityIds: ["entity.toto", "entity.wizard"],
        stakes: [
          {
            id: "stake.accidental_witness",
            summary:
              "Keeping Toto close removes the immediate source trigger for exposure but lets the Voice retain control of the room.",
            affectedEntityIds: ["entity.dorothy", "entity.toto", "entity.wizard"],
          },
        ],
        approvalState: "source_verified",
      },
      {
        id: "premise.silver_shoes",
        summary:
          "Dorothy wears silver shoes in this checked 1900 book source.",
        textForm: "original_summary",
        origin: { kind: "source", sourceLocatorIds: ["source.oz.15.gutenberg"] },
        meaning:
          "The pack must keep book facts separate from later adaptation imagery.",
        recognizerEntityIds: ["entity.dorothy", "entity.wizard"],
        stakes: [
          {
            id: "stake.source_contamination",
            summary:
              "An adaptation-only prop would create a false causal resource and undermine the source boundary.",
            affectedEntityIds: ["entity.dorothy", "entity.wizard"],
          },
        ],
        approvalState: "source_verified",
      },
    ],
    zones: [
      {
        id: "zone.oz.throne_room",
        name: "Throne Room",
        summary:
          "A guarded green room holds the travelers, the unseen Voice, and the screen that keeps its operator hidden.",
        connectedZoneIds: [],
      },
    ],
    actors: [
      {
        id: "entity.dorothy",
        name: "Dorothy",
        participantLabel: "Dorothy",
        simulationRole: "focal_participant",
        publicDescription:
          "Dorothy wants a usable answer for her companions without mistaking the Voice's display for proof of its authority.",
        currentZoneId: "zone.oz.throne_room",
        agenda: {
          desire: "Win a clear answer from the Voice and protect her companions while the room's authority is still uncertain.",
          avoids: "Avoid adding an unregistered fact or sacrificing Toto merely to force a faster revelation.",
          priority: 100,
          state: "active",
          defaultActionId: "action.dorothy.challenge_voice",
        },
      },
      {
        id: "entity.wizard",
        name: "The Wizard",
        participantLabel: "the Voice",
        simulationRole: "npc",
        publicDescription:
          "An unseen authority delays every request because inspection of the room would cost him the control the spectacle provides.",
        currentZoneId: "zone.oz.throne_room",
        agenda: {
          desire: "Keep the screen upright and postpone any demand that makes the group inspect the source of the Voice.",
          avoids: "Avoid direct exposure of the mechanism behind the green screen.",
          priority: 95,
          state: "active",
          defaultActionId: "action.wizard.delay",
        },
      },
      {
        id: "entity.toto",
        name: "Toto",
        participantLabel: "Toto",
        simulationRole: "npc",
        publicDescription:
          "A small dog is not interested in the Voice's authority and can turn a disturbance into an accidental inspection.",
        currentZoneId: "zone.oz.throne_room",
        agenda: {
          desire: "Follow immediate movement and noise rather than the adults' stated plan.",
          avoids: "Remain still when a sudden noise or opening draws attention.",
          priority: 90,
          state: "active",
          defaultActionId: "action.toto.hold_position",
        },
      },
      {
        id: "entity.lion",
        name: "Cowardly Lion",
        participantLabel: "the Lion",
        simulationRole: "npc",
        publicDescription:
          "The Lion wants the courage he was promised and can turn a demand into a room-shaking noise.",
        currentZoneId: "zone.oz.throne_room",
        agenda: {
          desire: "Make the unseen ruler keep the promise made to him.",
          avoids: "Let the Voice postpone the group's request without a visible response.",
          priority: 85,
          state: "active",
          defaultActionId: "action.lion.wait",
        },
      },
    ],
    actions: [
      {
        id: "action.dorothy.challenge_voice",
        label: "Compare the appearances",
        summary:
          "Dorothy asks the travelers to put their conflicting reports of Oz before the Voice and require a direct answer.",
        verbAliases: ["compare appearances", "challenge the voice", "ask companions"],
        actorMode: "participant",
        allowedActorEntityIds: ["entity.dorothy"],
        targetMode: "entity",
        allowedTargetEntityIds: ["entity.wizard"],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning:
          "The move creates shared public pressure but does not reveal the hidden operator by itself.",
      },
      {
        id: "action.dorothy.call_lion_roar",
        label: "Ask the Lion to roar",
        summary:
          "Dorothy asks the Lion to make the forceful demand that shakes the throne room and tests the screen's protection.",
        verbAliases: ["ask lion to roar", "call lion roar", "make lion roar"],
        actorMode: "participant",
        allowedActorEntityIds: ["entity.dorothy"],
        targetMode: "entity",
        allowedTargetEntityIds: ["entity.lion"],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning:
          "The roar creates a declared physical disruption whose consequence depends on Toto's position.",
      },
      {
        id: "action.dorothy.restrain_toto",
        label: "Keep Toto close",
        summary:
          "Dorothy keeps Toto beside her before the room is disturbed, preventing him from reaching the green screen.",
        verbAliases: ["hold toto", "restrain toto", "keep toto close"],
        actorMode: "participant",
        allowedActorEntityIds: ["entity.dorothy"],
        targetMode: "entity",
        allowedTargetEntityIds: ["entity.toto"],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning:
          "This creator-approved alternate condition protects Toto but deliberately changes the exposure trigger.",
      },
      {
        id: "action.wizard.delay",
        label: "Delay the petition",
        summary:
          "The Voice postpones a demand rather than letting the travelers inspect the ruler they are addressing.",
        verbAliases: ["delay petition"],
        actorMode: "npc",
        allowedActorEntityIds: ["entity.wizard"],
        targetMode: "none",
        allowedTargetEntityIds: [],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning:
          "Delay preserves the Wizard's authority only while the screen remains unexamined.",
      },
      {
        id: "action.wizard.admit_deception",
        label: "Admit the deception",
        summary:
          "After exposure, the Wizard admits that the intimidating forms were managed effects rather than his visible body.",
        verbAliases: ["admit deception"],
        actorMode: "npc",
        allowedActorEntityIds: ["entity.wizard"],
        targetMode: "none",
        allowedTargetEntityIds: [],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning:
          "The confession converts a physical reveal into a new shared understanding of the spectacle.",
      },
      {
        id: "action.wizard.hold_illusion",
        label: "Keep the screen standing",
        summary:
          "With Toto restrained, the Voice uses the intact screen to keep the promised answers deferred.",
        verbAliases: ["hold illusion"],
        actorMode: "npc",
        allowedActorEntityIds: ["entity.wizard"],
        targetMode: "none",
        allowedTargetEntityIds: [],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning:
          "The alternate route protects the illusion's physical condition and therefore its bargaining power.",
      },
      {
        id: "action.toto.topple_screen",
        label: "Topple the screen",
        summary:
          "Toto reaches the green screen during the disturbance and dislodges it, exposing the man behind the Voice.",
        verbAliases: ["topple screen"],
        actorMode: "npc",
        allowedActorEntityIds: ["entity.toto"],
        targetMode: "none",
        allowedTargetEntityIds: [],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning:
          "The accidental movement turns a hidden mechanism into visible evidence for the room.",
      },
      {
        id: "action.toto.hold_position",
        label: "Stay beside Dorothy",
        summary:
          "Toto remains beside Dorothy when she takes hold of him before the room is disturbed.",
        verbAliases: ["hold position"],
        actorMode: "npc",
        allowedActorEntityIds: ["entity.toto"],
        targetMode: "none",
        allowedTargetEntityIds: [],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning:
          "The alternate position prevents an accidental reach toward the screen without changing the source's already-established facts.",
      },
      {
        id: "action.lion.wait",
        label: "Wait for an answer",
        summary:
          "The Lion holds his demand until Dorothy chooses whether to make the room test the Voice's authority.",
        verbAliases: ["wait for answer"],
        actorMode: "npc",
        allowedActorEntityIds: ["entity.lion"],
        targetMode: "none",
        allowedTargetEntityIds: [],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning:
          "The Lion's unsatisfied demand remains pressure rather than an autonomous conclusion.",
      },
    ],
    initialPrivateKnowledge: [
      {
        entityId: "entity.dorothy",
        premiseIds: ["premise.conflicting_appearances", "premise.silver_shoes"],
      },
      { entityId: "entity.wizard", premiseIds: ["premise.wizard_behind_screen", "premise.silver_shoes"] },
      { entityId: "entity.toto", premiseIds: [] },
      { entityId: "entity.lion", premiseIds: ["premise.conflicting_appearances"] },
    ],
    initialFlags: [
      { id: "flag.public_pressure", value: false },
      { id: "flag.toto_restrained", value: false },
      { id: "flag.screen_toppled", value: false },
      { id: "flag.wizard_exposed", value: false },
      { id: "flag.illusion_holds", value: false },
    ],
    clocks: [
      { id: "clock.illusion_pressure", label: "Illusion Pressure", initialValue: 0, maxValue: 3 },
    ],
    creatorRuleApprovalReceipts: [
      {
        binding: {
          receiptId: "receipt.oz.creator_if",
          subjectFingerprint: "50378d7b57626d414e0860d3557981c1ba0c77f4703b58d37a74ba51ea92509f",
          issuer: "creator",
          issuerAuthorityId: "creator.penelope_ontology",
        },
        scenarioId: "scenario.oz.chapter_15.discovery",
        approvedOn: "2026-07-21",
        decisions: [
          {
            decisionId: "decision.oz.creator_if",
            action: "approve_as_creator_authored_if",
            ruleIds: [
              "reaction.wizard.delay",
              "reaction.toto.accept_restraint",
              "reaction.wizard.hold_illusion",
              "ending.public_pressure_exposure",
              "ending.illusion_holds",
              "ending.timeout",
            ],
          },
        ],
      },
    ],
    creatorRuleApprovalAuthorityRegistry: {
      creatorAuthorityIds: ["creator.penelope_ontology"],
      trustedReceipts: [
        {
          receiptId: "receipt.oz.creator_if",
          subjectFingerprint: "50378d7b57626d414e0860d3557981c1ba0c77f4703b58d37a74ba51ea92509f",
          issuer: "creator",
          issuerAuthorityId: "creator.penelope_ontology",
          payloadFingerprint: "75956fec556712d3e17ed63dc9a4dc0a26590ed167e18e67848236d3ce985d27",
        },
      ],
    },
    reactionRules: [
      {
        id: "reaction.toto.accept_restraint",
        actorEntityId: "entity.toto",
        actionId: "action.toto.hold_position",
        priority: 100,
        summary:
          "When Dorothy holds Toto close before the disturbance, he remains beside her instead of reaching the screen.",
        observableSummary:
          "Toto stays against Dorothy's side, watching the screen without running toward it.",
        provenance: {
          basis: "agent_proposed",
          premiseIds: ["premise.toto_topples_screen"],
          reviewState: "creator_approved",
          canonStatus: "not_source_canon",
          creatorApprovalReceiptId: "receipt.oz.creator_if",
          creatorDecisionId: "decision.oz.creator_if",
        },
        conditions: [
          { kind: "action_observed", actionId: "action.dorothy.restrain_toto", actorEntityId: "entity.dorothy" },
          { kind: "flag_equals", flagId: "flag.toto_restrained", value: false },
        ],
        effects: [{ kind: "set_flag", flagId: "flag.toto_restrained", value: true }],
        once: true,
      },
      {
        id: "reaction.wizard.delay",
        actorEntityId: "entity.wizard",
        actionId: "action.wizard.delay",
        priority: 80,
        summary:
          "When Dorothy makes the conflicting appearances public, the Voice delays instead of allowing an inspection of the screen.",
        observableSummary:
          "The Voice postpones a direct answer and orders the travelers to wait again.",
        provenance: {
          basis: "agent_proposed",
          premiseIds: ["premise.conflicting_appearances", "premise.wizard_behind_screen"],
          reviewState: "creator_approved",
          canonStatus: "not_source_canon",
          creatorApprovalReceiptId: "receipt.oz.creator_if",
          creatorDecisionId: "decision.oz.creator_if",
        },
        conditions: [
          { kind: "action_observed", actionId: "action.dorothy.challenge_voice", actorEntityId: "entity.dorothy" },
          { kind: "flag_equals", flagId: "flag.public_pressure", value: false },
        ],
        effects: [
          { kind: "set_flag", flagId: "flag.public_pressure", value: true },
          { kind: "advance_clock", clockId: "clock.illusion_pressure", delta: 1 },
        ],
        once: true,
      },
      {
        id: "reaction.toto.topple_screen",
        actorEntityId: "entity.toto",
        actionId: "action.toto.topple_screen",
        priority: 100,
        summary:
          "When the Lion's roar is called for and Toto is not restrained, Toto overturns the screen and reveals the hidden operator.",
        observableSummary:
          "Toto reaches the screen, pulls it down, and leaves the small man behind the Voice in full view.",
        provenance: {
          basis: "source_derived",
          premiseIds: ["premise.toto_topples_screen", "premise.wizard_behind_screen"],
          reviewState: "source_grounded",
          canonStatus: "source_canon",
          creatorApprovalReceiptId: null,
          creatorDecisionId: null,
        },
        conditions: [
          { kind: "action_observed", actionId: "action.dorothy.call_lion_roar", actorEntityId: "entity.dorothy" },
          { kind: "flag_equals", flagId: "flag.toto_restrained", value: false },
          { kind: "flag_equals", flagId: "flag.screen_toppled", value: false },
        ],
        effects: [
          { kind: "set_flag", flagId: "flag.screen_toppled", value: true },
          { kind: "set_flag", flagId: "flag.wizard_exposed", value: true },
          { kind: "grant_knowledge", entityId: "entity.dorothy", premiseId: "premise.wizard_behind_screen" },
          { kind: "advance_clock", clockId: "clock.illusion_pressure", delta: 2 },
        ],
        once: true,
      },
      {
        id: "reaction.wizard.admit_deception",
        actorEntityId: "entity.wizard",
        actionId: "action.wizard.admit_deception",
        priority: 90,
        summary:
          "Once the screen falls, the Wizard admits that the imposing forms were managed effects and cannot be maintained as a visible ruler.",
        observableSummary:
          "The exposed man admits that the frightening appearances were constructed to keep the room in awe.",
        provenance: {
          basis: "source_derived",
          premiseIds: ["premise.wizard_behind_screen"],
          reviewState: "source_grounded",
          canonStatus: "source_canon",
          creatorApprovalReceiptId: null,
          creatorDecisionId: null,
        },
        conditions: [
          { kind: "flag_equals", flagId: "flag.wizard_exposed", value: true },
        ],
        effects: [
          { kind: "set_agenda_state", entityId: "entity.wizard", state: "satisfied" },
        ],
        once: true,
      },
      {
        id: "reaction.wizard.hold_illusion",
        actorEntityId: "entity.wizard",
        actionId: "action.wizard.hold_illusion",
        priority: 95,
        summary:
          "If Dorothy keeps Toto close before demanding the roar, the screen stays upright and the Voice retains time to defer the answer.",
        observableSummary:
          "Toto does not reach the screen; the Voice remains unseen and tells the room to wait.",
        provenance: {
          basis: "agent_proposed",
          premiseIds: ["premise.toto_topples_screen", "premise.wizard_behind_screen"],
          reviewState: "creator_approved",
          canonStatus: "not_source_canon",
          creatorApprovalReceiptId: "receipt.oz.creator_if",
          creatorDecisionId: "decision.oz.creator_if",
        },
        conditions: [
          { kind: "action_observed", actionId: "action.dorothy.call_lion_roar", actorEntityId: "entity.dorothy" },
          { kind: "flag_equals", flagId: "flag.toto_restrained", value: true },
          { kind: "flag_equals", flagId: "flag.illusion_holds", value: false },
        ],
        effects: [
          { kind: "set_flag", flagId: "flag.illusion_holds", value: true },
          { kind: "advance_clock", clockId: "clock.illusion_pressure", delta: 1 },
        ],
        once: true,
      },
    ],
    narrationSpeechDirectives: [],
    endingRules: [
      {
        id: "ending.humbug_exposed",
        kind: "humbug_exposed",
        priority: 80,
        summary:
          "Toto has toppled the screen and the Wizard's hidden position is visible before the room can restore the spectacle.",
        provenance: {
          basis: "source_derived",
          premiseIds: ["premise.toto_topples_screen", "premise.wizard_behind_screen"],
          reviewState: "source_grounded",
          canonStatus: "source_canon",
          creatorApprovalReceiptId: null,
          creatorDecisionId: null,
        },
        conditions: [
          { kind: "flag_equals", flagId: "flag.wizard_exposed", value: true },
          { kind: "flag_equals", flagId: "flag.public_pressure", value: false },
        ],
        terminal: true,
      },
      {
        id: "ending.public_pressure_exposure",
        kind: "public_pressure_exposure",
        priority: 90,
        summary:
          "The screen falls after Dorothy turns the conflicting appearances into shared pressure, creating a creator-approved alternate exposure route.",
        provenance: {
          basis: "agent_proposed",
          premiseIds: ["premise.conflicting_appearances", "premise.toto_topples_screen"],
          reviewState: "creator_approved",
          canonStatus: "not_source_canon",
          creatorApprovalReceiptId: "receipt.oz.creator_if",
          creatorDecisionId: "decision.oz.creator_if",
        },
        conditions: [
          { kind: "flag_equals", flagId: "flag.wizard_exposed", value: true },
          { kind: "flag_equals", flagId: "flag.public_pressure", value: true },
        ],
        terminal: true,
      },
      {
        id: "ending.illusion_holds",
        kind: "illusion_holds",
        priority: 100,
        summary:
          "Dorothy's creator-approved choice keeps Toto from the screen, so the Voice remains concealed and the promised answer stays delayed.",
        provenance: {
          basis: "agent_proposed",
          premiseIds: ["premise.toto_topples_screen", "premise.wizard_behind_screen"],
          reviewState: "creator_approved",
          canonStatus: "not_source_canon",
          creatorApprovalReceiptId: "receipt.oz.creator_if",
          creatorDecisionId: "decision.oz.creator_if",
        },
        conditions: [
          { kind: "flag_equals", flagId: "flag.illusion_holds", value: true },
        ],
        terminal: true,
      },
      {
        id: "ending.timeout",
        kind: "timeout",
        priority: 1,
        summary:
          "The two-turn rehearsal ends without an exposure, preserving the current pressure for a later creator decision.",
        provenance: {
          basis: "agent_proposed",
          premiseIds: [],
          reviewState: "creator_approved",
          canonStatus: "not_source_canon",
          creatorApprovalReceiptId: "receipt.oz.creator_if",
          creatorDecisionId: "decision.oz.creator_if",
        },
        conditions: [{ kind: "turn_at_least", turn: 2 }],
        terminal: true,
      },
    ],
  },
});

export const getOzDiscoveryWorldPack = (): PenelopeWorldPackV1 =>
  structuredClone(OZ_DISCOVERY_WORLD_PACK);
