import {
  WorldSimulationScenarioSchema,
  type WorldSimulationScenario,
} from "@/src/contracts/world-simulation";

export const ODYSSEY_BOOK_19_WORLD_SIMULATION =
  WorldSimulationScenarioSchema.parse({
    id: "scenario.odyssey_book_19.night_of_the_scar",
    title: "The Night of the Scar",
    summary:
      "A bounded one-night simulation in Ithaca tests whether Penelope can pursue evidence while the disguised Odysseus, Eurycleia, and Melantho act on private knowledge and competing agendas.",
    focalParticipantEntityId: "entity.penelope",
    maxTurns: 6,
    maxReactionsPerTurn: 2,
    sourceLocators: [
      {
        id: "source.odyssey.19.perseus",
        work: "Homer, Odyssey",
        book: "19",
        passage: "Od. 19.50-130 and 19.350-505",
        url: "https://www.perseus.tufts.edu/hopper/text?doc=Perseus%3Atext%3A1999.01.0136%3Abook%3D19",
        sourceStatus: "primary_source_checked",
        checkedAt: "2026-07-17",
        evidenceSummary: "The text places Penelope's interview by the hearth, shows Melantho's hostility, orders Eurycleia's washing, identifies the scar recognition, and keeps Penelope from understanding the nurse's glance.",
        usage: "original_summary_only",
      },
      {
        id: "source.odyssey.23.perseus",
        work: "Homer, Odyssey",
        book: "23",
        passage: "Od. 23.165-230",
        url: "https://www.perseus.tufts.edu/hopper/text?doc=Perseus%3Atext%3A1999.01.0136%3Abook%3D23",
        sourceStatus: "primary_source_checked",
        checkedAt: "2026-07-17",
        evidenceSummary: "Penelope withholds recognition until the immovable bed test gives her a private token she accepts as proof.",
        usage: "original_summary_only",
      },
    ],
    premises: [
      {
        id: "premise.stranger_identity",
        summary:
          "The stranger speaking with Penelope is Odysseus in a disguise that protects the planned reckoning with the suitors.",
        textForm: "original_summary",
        origin: {
          kind: "source",
          sourceLocatorIds: ["source.odyssey.19.perseus"],
        },
        meaning:
          "Identity is a private world truth, so evidence may change a character's knowledge without changing the underlying fact.",
        recognizerEntityIds: ["entity.odysseus", "entity.eurycleia"],
        stakes: [
          {
            id: "stake.identity_exposure",
            summary:
              "Premature exposure can endanger Odysseus and force the household reckoning to accelerate or fail.",
            affectedEntityIds: ["entity.odysseus", "entity.penelope", "entity.eurycleia"],
          },
        ],
        approvalState: "source_verified",
      },
      {
        id: "premise.scar_recognition",
        summary:
          "Eurycleia knows an old scar well enough to recognize Odysseus when washing the disguised stranger's feet.",
        textForm: "original_summary",
        origin: {
          kind: "source",
          sourceLocatorIds: ["source.odyssey.19.perseus"],
        },
        meaning:
          "The scar is a conditional recognition trigger rather than automatic public proof of the stranger's identity.",
        recognizerEntityIds: ["entity.eurycleia", "entity.odysseus"],
        stakes: [
          {
            id: "stake.recognition_witness",
            summary:
              "Who witnesses Eurycleia's reaction determines whether recognition remains private or compromises the plan.",
            affectedEntityIds: ["entity.eurycleia", "entity.odysseus", "entity.melantho"],
          },
        ],
        approvalState: "source_verified",
      },
      {
        id: "premise.penelope_bounded_evidence",
        summary:
          "The stranger supplies details connected to Odysseus that move Penelope but do not yet settle his identity for her.",
        textForm: "original_summary",
        origin: {
          kind: "source",
          sourceLocatorIds: ["source.odyssey.19.perseus"],
        },
        meaning:
          "Penelope may gain confidence in testimony while retaining uncertainty about the person who delivers it.",
        recognizerEntityIds: ["entity.penelope", "entity.odysseus"],
        stakes: [
          {
            id: "stake.penelope_judgment",
            summary:
              "Evidence must remain distinguishable from recognition so Penelope's judgment is not replaced by narrator certainty.",
            affectedEntityIds: ["entity.penelope", "entity.odysseus"],
          },
        ],
        approvalState: "source_verified",
      },
      {
        id: "premise.palace_danger",
        summary:
          "Suitor-aligned members of the occupied household can turn unusual behavior or overheard speech into danger for the people involved.",
        textForm: "original_summary",
        origin: {
          kind: "source",
          sourceLocatorIds: ["source.odyssey.19.perseus"],
        },
        meaning:
          "Privacy, witnesses, and delay have causal weight even when no combat occurs during the session.",
        recognizerEntityIds: [
          "entity.penelope",
          "entity.odysseus",
          "entity.eurycleia",
          "entity.melantho",
        ],
        stakes: [
          {
            id: "stake.household_suspicion",
            summary:
              "Growing suspicion can expose allies, isolate Penelope, or force Odysseus to change his timetable.",
            affectedEntityIds: [
              "entity.penelope",
              "entity.odysseus",
              "entity.eurycleia",
              "entity.melantho",
            ],
          },
        ],
        approvalState: "source_verified",
      },
      {
        id: "premise.penelope_not_certain",
        summary:
          "At this point in the night Penelope has not yet accepted the stranger as Odysseus, even when his testimony affects her deeply.",
        textForm: "original_summary",
        origin: {
          kind: "source",
          sourceLocatorIds: ["source.odyssey.19.perseus", "source.odyssey.23.perseus"],
        },
        meaning:
          "A controlled alternate discovery must earn a knowledge change and may not assume the later recognition has already occurred.",
        recognizerEntityIds: ["entity.penelope"],
        stakes: [
          {
            id: "stake.recognition_timing",
            summary:
              "Changing the timing of Penelope's recognition changes her agency and the risk carried by every later choice.",
            affectedEntityIds: ["entity.penelope", "entity.odysseus"],
          },
        ],
        approvalState: "source_verified",
      },
      {
        id: "premise.eurycleia_loyalty",
        summary:
          "Eurycleia's long service and recognition of Odysseus give her reason to protect him even when surprise makes silence difficult.",
        textForm: "original_summary",
        origin: {
          kind: "source",
          sourceLocatorIds: ["source.odyssey.19.perseus"],
        },
        meaning:
          "Eurycleia is an acting character with competing impulses, not a passive device that merely delivers information.",
        recognizerEntityIds: ["entity.eurycleia", "entity.odysseus"],
        stakes: [
          {
            id: "stake.eurycleia_choice",
            summary:
              "Her response can preserve the plan, reveal the truth privately, or create a witness who cannot be ignored.",
            affectedEntityIds: ["entity.eurycleia", "entity.odysseus", "entity.penelope"],
          },
        ],
        approvalState: "source_verified",
      },
      {
        id: "premise.melantho_hostility",
        summary:
          "During Penelope's night interview, Melantho openly abuses the stranger; Penelope hears and rebukes her.",
        textForm: "original_summary",
        origin: {
          kind: "source",
          sourceLocatorIds: ["source.odyssey.19.perseus"],
        },
        meaning:
          "The simulation uses that witnessed hostility as a bounded basis for Melantho to watch an exclusion or disturbance, not as proof that she knows the hidden identity.",
        recognizerEntityIds: ["entity.melantho", "entity.penelope", "entity.odysseus"],
        stakes: [
          {
            id: "stake.melantho_report",
            summary:
              "If Melantho obtains a credible irregularity, the suitor faction can react before Penelope resolves her uncertainty.",
            affectedEntityIds: ["entity.melantho", "entity.penelope", "entity.odysseus"],
          },
        ],
        approvalState: "source_verified",
      },
    ],
    zones: [
      {
        id: "zone.great_hall_hearth",
        name: "Great Hall Hearth",
        summary:
          "The interview takes place near the hearth, where speech is intimate but servants can still enter or overhear.",
        connectedZoneIds: ["zone.inner_corridor"],
      },
      {
        id: "zone.inner_corridor",
        name: "Inner Corridor",
        summary:
          "The corridor connects the interview to the women's quarters and creates a narrow route for witnesses and interruptions.",
        connectedZoneIds: ["zone.great_hall_hearth", "zone.washing_store"],
      },
      {
        id: "zone.washing_store",
        name: "Washing Store",
        summary:
          "The small service room holds water and cloth and can briefly remove a servant from the interview's immediate hearing.",
        connectedZoneIds: ["zone.inner_corridor"],
      },
    ],
    actors: [
      {
        id: "entity.penelope",
        name: "Penelope",
        participantLabel: "Penelope",
        simulationRole: "focal_participant",
        publicDescription:
          "The ruler of the strained household tests testimony carefully while refusing to turn grief or hope into certainty.",
        currentZoneId: "zone.great_hall_hearth",
        agenda: {
          desire: "Obtain useful evidence about Odysseus without surrendering control of the household or her own judgment.",
          avoids: "Avoid public claims that expose allies or let the suitors control the meaning of uncertain evidence.",
          priority: 100,
          state: "active",
          defaultActionId: "action.penelope.observe",
        },
      },
      {
        id: "entity.odysseus",
        name: "Disguised Odysseus",
        participantLabel: "the stranger",
        simulationRole: "npc",
        publicDescription:
          "A wary stranger offers precise testimony but gives Penelope reason to test every detail before trusting him.",
        currentZoneId: "zone.great_hall_hearth",
        agenda: {
          desire: "Preserve his disguise while giving Penelope enough truthful detail to sustain trust and the coming plan.",
          avoids: "Avoid a public recognition that reaches the suitor faction before he controls the terms of confrontation.",
          priority: 95,
          state: "active",
          defaultActionId: "action.odysseus.answer_carefully",
        },
      },
      {
        id: "entity.eurycleia",
        name: "Eurycleia",
        participantLabel: "Eurycleia",
        simulationRole: "npc",
        publicDescription:
          "The elderly nurse attends Penelope and carries a long memory of the absent household master.",
        currentZoneId: "zone.great_hall_hearth",
        agenda: {
          desire: "Serve Penelope faithfully and protect the household member she recognizes when the scar becomes visible.",
          avoids: "Avoid betraying Odysseus through an uncontrolled cry, gesture, or disclosure before the household is secure.",
          priority: 90,
          state: "active",
          defaultActionId: "action.eurycleia.wash_feet",
        },
      },
      {
        id: "entity.melantho",
        name: "Melantho",
        participantLabel: "Melantho",
        simulationRole: "npc",
        publicDescription:
          "A hostile household servant watches the stranger and treats disruptions around Penelope as useful leverage.",
        currentZoneId: "zone.inner_corridor",
        agenda: {
          desire: "Discover irregular behavior around the interview that can strengthen her position with the suitor faction.",
          avoids: "Avoid confronting Penelope without a reportable sign that someone else will treat as credible.",
          priority: 70,
          state: "active",
          defaultActionId: "action.melantho.investigate",
        },
      },
    ],
    actions: [
      {
        id: "action.penelope.observe",
        label: "Observe without intervening",
        summary: "Penelope waits through the next exchange and studies who reacts before she commits to a conclusion.",
        verbAliases: ["observe", "wait", "watch silently"],
        actorMode: "participant",
        allowedActorEntityIds: ["entity.penelope"],
        targetMode: "none",
        allowedTargetEntityIds: [],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning: "Waiting yields initiative to NPC agendas and allows household pressure to advance without a player benefit.",
      },
      {
        id: "action.penelope.test_testimony",
        label: "Test the stranger's testimony",
        summary: "Penelope requests a specific remembered detail and compares the answer with evidence she already trusts.",
        verbAliases: ["question", "test testimony", "ask for proof"],
        actorMode: "participant",
        allowedActorEntityIds: ["entity.penelope"],
        targetMode: "entity",
        allowedTargetEntityIds: ["entity.odysseus"],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning: "The action can strengthen bounded confidence in testimony but cannot grant hidden identity knowledge by itself.",
      },
      {
        id: "action.penelope.order_washing",
        label: "Order the foot washing",
        summary: "Penelope asks Eurycleia to wash the stranger's feet, bringing old household memory into physical contact with him.",
        verbAliases: ["order washing", "wash his feet", "bring the basin"],
        actorMode: "participant",
        allowedActorEntityIds: ["entity.penelope"],
        targetMode: "entity",
        allowedTargetEntityIds: ["entity.eurycleia"],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning: "The order creates the sourced condition under which Eurycleia can encounter the scar and recognize Odysseus.",
      },
      {
        id: "action.penelope.clear_room",
        label: "Dismiss a witness",
        summary: "Penelope sends Melantho away from the interview, reducing immediate access while making the exclusion noticeable.",
        verbAliases: ["dismiss melantho", "clear the room", "send her away"],
        actorMode: "participant",
        allowedActorEntityIds: ["entity.penelope"],
        targetMode: "entity",
        allowedTargetEntityIds: ["entity.melantho"],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning: "Removing a witness protects one exchange but can increase the excluded observer's motive to investigate later.",
      },
      {
        id: "action.penelope.confront_privately",
        label: "Confront the stranger privately",
        summary: "Penelope states her strongest inference in private and requires the stranger and Eurycleia to answer the risk it creates.",
        verbAliases: ["confront", "ask his identity", "name odysseus"],
        actorMode: "participant",
        allowedActorEntityIds: ["entity.penelope"],
        targetMode: "entity",
        allowedTargetEntityIds: ["entity.odysseus"],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning: "A private confrontation can open a controlled alternate discovery only after relevant evidence has entered the scene.",
      },
      {
        id: "action.odysseus.answer_carefully",
        label: "Answer with bounded evidence",
        summary: "Odysseus answers with a precise remembered detail while refusing to expose the identity behind his testimony.",
        verbAliases: ["answer carefully", "offer evidence"],
        actorMode: "npc",
        allowedActorEntityIds: ["entity.odysseus"],
        targetMode: "entity",
        allowedTargetEntityIds: ["entity.penelope"],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning: "The answer can change Penelope's assessment of testimony without granting certainty about the speaker's identity.",
      },
      {
        id: "action.odysseus.contain_recognition",
        label: "Contain Eurycleia's recognition",
        summary: "Odysseus responds immediately to Eurycleia's recognition and binds the knowledge to the smallest possible circle.",
        verbAliases: ["contain recognition", "silence eurycleia"],
        actorMode: "npc",
        allowedActorEntityIds: ["entity.odysseus"],
        targetMode: "entity",
        allowedTargetEntityIds: ["entity.eurycleia"],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning: "Containment protects the plan but creates a private burden and leaves visible behavior that others may still interpret.",
      },
      {
        id: "action.eurycleia.wash_feet",
        label: "Wash the stranger's feet",
        summary: "Eurycleia carries out Penelope's order and handles the stranger closely enough for the old scar to become evidence.",
        verbAliases: ["wash feet", "begin washing"],
        actorMode: "npc",
        allowedActorEntityIds: ["entity.eurycleia"],
        targetMode: "entity",
        allowedTargetEntityIds: ["entity.odysseus"],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning: "The washing can expose the scar and grant Eurycleia identity knowledge without automatically granting it to Penelope.",
      },
      {
        id: "action.eurycleia.guard_secret",
        label: "Guard the recognized identity",
        summary: "Eurycleia restrains her immediate response and treats the newly recognized identity as a dangerous private trust.",
        verbAliases: ["guard the secret", "remain silent"],
        actorMode: "npc",
        allowedActorEntityIds: ["entity.eurycleia"],
        targetMode: "none",
        allowedTargetEntityIds: [],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning: "Her silence contains the information but cannot erase witnesses, suspicion, or the obligations created by recognition.",
      },
      {
        id: "action.eurycleia.confirm_privately",
        label: "Confirm the identity privately",
        summary: "Eurycleia answers Penelope inside a controlled circle after the scar has given her grounds to speak.",
        verbAliases: ["confirm privately", "answer penelope"],
        actorMode: "npc",
        allowedActorEntityIds: ["entity.eurycleia"],
        targetMode: "entity",
        allowedTargetEntityIds: ["entity.penelope"],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning: "Private confirmation transfers earned identity knowledge to Penelope without making it household knowledge.",
      },
      {
        id: "action.melantho.investigate",
        label: "Investigate the disturbance",
        summary: "Melantho approaches the interview and looks for a visible irregularity that can be reported to the suitor faction.",
        verbAliases: ["investigate", "listen nearby", "seek evidence"],
        actorMode: "npc",
        allowedActorEntityIds: ["entity.melantho"],
        targetMode: "entity",
        allowedTargetEntityIds: ["entity.penelope", "entity.odysseus", "entity.eurycleia"],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning: "Investigation converts visible irregularities into suspicion without granting Melantho the hidden identity for free.",
      },
    ],
    initialPrivateKnowledge: [
      {
        entityId: "entity.penelope",
        premiseIds: [
          "premise.penelope_bounded_evidence",
          "premise.palace_danger",
          "premise.penelope_not_certain",
          "premise.melantho_hostility",
        ],
      },
      {
        entityId: "entity.odysseus",
        premiseIds: [
          "premise.stranger_identity",
          "premise.scar_recognition",
          "premise.penelope_bounded_evidence",
          "premise.palace_danger",
          "premise.penelope_not_certain",
          "premise.eurycleia_loyalty",
          "premise.melantho_hostility",
        ],
      },
      {
        entityId: "entity.eurycleia",
        premiseIds: [
          "premise.scar_recognition",
          "premise.palace_danger",
          "premise.eurycleia_loyalty",
        ],
      },
      {
        entityId: "entity.melantho",
        premiseIds: ["premise.palace_danger", "premise.melantho_hostility"],
      },
    ],
    initialFlags: [
      { id: "flag.scar_exposed", value: false },
      { id: "flag.eurycleia_recognized", value: false },
      { id: "flag.secret_contained", value: false },
      { id: "flag.controlled_discovery", value: false },
      { id: "flag.plan_compromised", value: false },
      { id: "flag.melantho_alerted", value: false },
      { id: "flag.testimony_tested", value: false },
    ],
    clocks: [
      { id: "clock.identity_exposure", label: "Identity Exposure", initialValue: 0, maxValue: 4 },
      { id: "clock.suitor_suspicion", label: "Suitor Suspicion", initialValue: 0, maxValue: 4 },
    ],
    creatorRuleApprovalReceipts: [
      {
        binding: {
          receiptId: "receipt.d6.night_of_the_scar",
          subjectFingerprint: "f9b966d395a6d5c103d97770005ed3f285155debb5fba1adb3b4419192aaeade",
          issuer: "creator",
          issuerAuthorityId: "creator.penelope_ontology",
        },
        scenarioId: "scenario.odyssey_book_19.night_of_the_scar",
        approvedOn: "2026-07-18",
        decisions: [
          { decisionId: "decision.d6-1", action: "approve", ruleIds: ["reaction.melantho.notice_exclusion"] },
          { decisionId: "decision.d6-2", action: "approve", ruleIds: ["reaction.melantho.approach_on_observe"] },
          { decisionId: "decision.d6-3", action: "approve", ruleIds: ["reaction.melantho.compromise_plan"] },
          { decisionId: "decision.d6-4", action: "approve_as_creator_authored_if", ruleIds: ["reaction.eurycleia.controlled_disclosure"] },
          { decisionId: "decision.d6-5", action: "approve", ruleIds: ["ending.controlled_discovery", "ending.plan_compromised", "ending.timeout"] },
        ],
      },
    ],
    creatorRuleApprovalAuthorityRegistry: {
      creatorAuthorityIds: ["creator.penelope_ontology"],
      trustedReceipts: [
        {
          receiptId: "receipt.d6.night_of_the_scar",
          subjectFingerprint: "f9b966d395a6d5c103d97770005ed3f285155debb5fba1adb3b4419192aaeade",
          issuer: "creator",
          issuerAuthorityId: "creator.penelope_ontology",
          payloadFingerprint: "afcfc9377e97fc1a80a54aa10a8ed163704360e4f9d035f0b4b55fca86542858",
        },
      ],
    },
    reactionRules: [
      {
        id: "reaction.eurycleia.recognize_scar",
        actorEntityId: "entity.eurycleia",
        actionId: "action.eurycleia.wash_feet",
        priority: 100,
        summary: "When the ordered washing exposes the scar, Eurycleia recognizes Odysseus and the identity becomes her private knowledge.",
        observableSummary: "Eurycleia's hands stop at the old scar, and surprise breaks her practiced composure.",
        provenance: {
          basis: "source_derived",
          premiseIds: ["premise.stranger_identity", "premise.scar_recognition"],
          reviewState: "source_grounded",
          canonStatus: "source_canon",
          creatorApprovalReceiptId: null,
          creatorDecisionId: null,
        },
        conditions: [
          {
            kind: "action_observed",
            actionId: "action.penelope.order_washing",
            actorEntityId: "entity.penelope",
          },
          { kind: "flag_equals", flagId: "flag.scar_exposed", value: false },
        ],
        effects: [
          { kind: "set_flag", flagId: "flag.scar_exposed", value: true },
          { kind: "set_flag", flagId: "flag.eurycleia_recognized", value: true },
          {
            kind: "grant_knowledge",
            entityId: "entity.eurycleia",
            premiseId: "premise.stranger_identity",
          },
          { kind: "advance_clock", clockId: "clock.identity_exposure", delta: 1 },
        ],
        once: true,
      },
      {
        id: "reaction.odysseus.contain_recognition",
        actorEntityId: "entity.odysseus",
        actionId: "action.odysseus.contain_recognition",
        priority: 95,
        summary: "After Eurycleia knows the identity, Odysseus acts to contain the recognition before it becomes household knowledge.",
        observableSummary: "The stranger catches Eurycleia's attention and stops her before she can speak.",
        provenance: {
          basis: "source_derived",
          premiseIds: ["premise.scar_recognition", "premise.eurycleia_loyalty"],
          reviewState: "source_grounded",
          canonStatus: "source_canon",
          creatorApprovalReceiptId: null,
          creatorDecisionId: null,
        },
        conditions: [
          {
            kind: "premise_known",
            entityId: "entity.eurycleia",
            premiseId: "premise.stranger_identity",
            expected: true,
          },
          { kind: "flag_equals", flagId: "flag.secret_contained", value: false },
          { kind: "flag_equals", flagId: "flag.melantho_alerted", value: false },
        ],
        effects: [
          { kind: "set_flag", flagId: "flag.secret_contained", value: true },
        ],
        once: true,
      },
      {
        id: "reaction.odysseus.answer_testimony",
        actorEntityId: "entity.odysseus",
        actionId: "action.odysseus.answer_carefully",
        priority: 85,
        summary: "When Penelope tests the testimony, Odysseus answers with a bounded remembered detail without claiming a revealed identity.",
        observableSummary: "The stranger answers with a precise remembered detail, then waits for Penelope to judge it.",
        provenance: {
          basis: "source_derived",
          premiseIds: ["premise.penelope_bounded_evidence"],
          reviewState: "source_grounded",
          canonStatus: "source_canon",
          creatorApprovalReceiptId: null,
          creatorDecisionId: null,
        },
        conditions: [
          {
            kind: "action_observed",
            actionId: "action.penelope.test_testimony",
            actorEntityId: "entity.penelope",
          },
          { kind: "flag_equals", flagId: "flag.testimony_tested", value: false },
        ],
        effects: [
          { kind: "set_flag", flagId: "flag.testimony_tested", value: true },
        ],
        once: true,
      },
      {
        id: "reaction.eurycleia.controlled_disclosure",
        actorEntityId: "entity.eurycleia",
        actionId: "action.eurycleia.confirm_privately",
        priority: 90,
        summary: "A private confrontation after recognition lets Eurycleia confirm the identity inside a controlled circle at real exposure cost.",
        observableSummary: "Inside the private circle, Eurycleia confirms to Penelope that the stranger is Odysseus.",
        provenance: {
          basis: "agent_proposed",
          premiseIds: ["premise.scar_recognition", "premise.penelope_not_certain"],
          reviewState: "creator_approved",
          canonStatus: "not_source_canon",
          creatorApprovalReceiptId: "receipt.d6.night_of_the_scar",
          creatorDecisionId: "decision.d6-4",
        },
        conditions: [
          {
            kind: "action_observed",
            actionId: "action.penelope.confront_privately",
            actorEntityId: "entity.penelope",
          },
          {
            kind: "premise_known",
            entityId: "entity.eurycleia",
            premiseId: "premise.stranger_identity",
            expected: true,
          },
        ],
        effects: [
          {
            kind: "grant_knowledge",
            entityId: "entity.penelope",
            premiseId: "premise.stranger_identity",
          },
          { kind: "set_flag", flagId: "flag.controlled_discovery", value: true },
          { kind: "advance_clock", clockId: "clock.identity_exposure", delta: 1 },
          { kind: "set_agenda_state", entityId: "entity.eurycleia", state: "satisfied" },
        ],
        once: true,
      },
      {
        id: "reaction.melantho.notice_exclusion",
        actorEntityId: "entity.melantho",
        actionId: "action.melantho.investigate",
        priority: 75,
        summary: "Being dismissed gives Melantho a concrete reason to investigate the interview instead of passively leaving the scene.",
        observableSummary: "Melantho leaves toward the washing store but glances back at the interview before turning the corner.",
        provenance: {
          basis: "agent_proposed",
          premiseIds: ["premise.melantho_hostility", "premise.palace_danger"],
          reviewState: "creator_approved",
          canonStatus: "not_source_canon",
          creatorApprovalReceiptId: "receipt.d6.night_of_the_scar",
          creatorDecisionId: "decision.d6-1",
        },
        conditions: [
          {
            kind: "action_observed",
            actionId: "action.penelope.clear_room",
            actorEntityId: "entity.penelope",
          },
        ],
        effects: [
          { kind: "move_actor", entityId: "entity.melantho", toZoneId: "zone.washing_store" },
          { kind: "advance_clock", clockId: "clock.suitor_suspicion", delta: 1 },
          { kind: "set_flag", flagId: "flag.melantho_alerted", value: true },
        ],
        once: true,
      },
      {
        id: "reaction.melantho.approach_on_observe",
        actorEntityId: "entity.melantho",
        actionId: "action.melantho.investigate",
        priority: 70,
        summary: "When Penelope waits instead of intervening, Melantho uses the open moment to approach the hearth and investigate.",
        observableSummary: "Melantho steps from the inner corridor toward the hearth and listens as the pause lengthens.",
        provenance: {
          basis: "agent_proposed",
          premiseIds: ["premise.melantho_hostility", "premise.palace_danger"],
          reviewState: "creator_approved",
          canonStatus: "not_source_canon",
          creatorApprovalReceiptId: "receipt.d6.night_of_the_scar",
          creatorDecisionId: "decision.d6-2",
        },
        conditions: [
          {
            kind: "action_observed",
            actionId: "action.penelope.observe",
            actorEntityId: "entity.penelope",
          },
          {
            kind: "actor_in_zone",
            entityId: "entity.melantho",
            zoneId: "zone.inner_corridor",
          },
        ],
        effects: [
          { kind: "move_actor", entityId: "entity.melantho", toZoneId: "zone.great_hall_hearth" },
          { kind: "advance_clock", clockId: "clock.suitor_suspicion", delta: 1 },
        ],
        once: true,
      },
      {
        id: "reaction.melantho.compromise_plan",
        actorEntityId: "entity.melantho",
        actionId: "action.melantho.investigate",
        priority: 80,
        summary: "If exposed recognition remains uncontained, Melantho turns the disturbance into a reportable threat to the hidden plan.",
        observableSummary: "Melantho catches the nurse's visible shock, leaves at once, and calls for a suitor-aligned servant.",
        provenance: {
          basis: "agent_proposed",
          premiseIds: ["premise.scar_recognition", "premise.melantho_hostility"],
          reviewState: "creator_approved",
          canonStatus: "not_source_canon",
          creatorApprovalReceiptId: "receipt.d6.night_of_the_scar",
          creatorDecisionId: "decision.d6-3",
        },
        conditions: [
          { kind: "flag_equals", flagId: "flag.scar_exposed", value: true },
          { kind: "flag_equals", flagId: "flag.secret_contained", value: false },
          { kind: "clock_at_least", clockId: "clock.suitor_suspicion", value: 1 },
        ],
        effects: [
          { kind: "set_flag", flagId: "flag.plan_compromised", value: true },
          { kind: "advance_clock", clockId: "clock.identity_exposure", delta: 2 },
          { kind: "set_agenda_state", entityId: "entity.melantho", state: "satisfied" },
        ],
        once: true,
      },
    ],
    narrationSpeechDirectives: [
      {
        id: "speech.eurycleia.controlled_disclosure",
        reactionRuleId: "reaction.eurycleia.controlled_disclosure",
        speakerEntityId: "entity.eurycleia",
        speechAct: "answer",
        plainIntent:
          "Confirm only to Penelope that the stranger is Odysseus; add no plan, history, motive, prediction, or promise.",
        contentBoundary:
          "Eurycleia identifies the stranger as Odysseus.",
        creatorApprovalReceiptId: "receipt.d6.night_of_the_scar",
        creatorDecisionId: "decision.d6-4",
      },
    ],
    endingRules: [
      {
        id: "ending.canon_contained",
        kind: "canon_contained",
        priority: 80,
        summary: "Eurycleia recognizes Odysseus, the private circle contains the knowledge, and Penelope remains short of certainty for now.",
        provenance: {
          basis: "source_derived",
          premiseIds: ["premise.scar_recognition", "premise.penelope_not_certain"],
          reviewState: "source_grounded",
          canonStatus: "source_canon",
          creatorApprovalReceiptId: null,
          creatorDecisionId: null,
        },
        conditions: [
          { kind: "flag_equals", flagId: "flag.eurycleia_recognized", value: true },
          { kind: "flag_equals", flagId: "flag.secret_contained", value: true },
          { kind: "flag_equals", flagId: "flag.controlled_discovery", value: false },
          { kind: "turn_at_least", turn: 2 },
        ],
        terminal: true,
      },
      {
        id: "ending.controlled_discovery",
        kind: "controlled_discovery",
        priority: 90,
        summary: "Penelope earns a private identity discovery while the immediate witness circle remains bounded and the wider household stays uncertain.",
        provenance: {
          basis: "agent_proposed",
          premiseIds: ["premise.scar_recognition", "premise.penelope_not_certain"],
          reviewState: "creator_approved",
          canonStatus: "not_source_canon",
          creatorApprovalReceiptId: "receipt.d6.night_of_the_scar",
          creatorDecisionId: "decision.d6-5",
        },
        conditions: [
          { kind: "flag_equals", flagId: "flag.controlled_discovery", value: true },
          { kind: "flag_equals", flagId: "flag.plan_compromised", value: false },
        ],
        terminal: true,
      },
      {
        id: "ending.plan_compromised",
        kind: "plan_compromised",
        priority: 100,
        summary: "A hostile observer gains enough evidence to end the quiet interview and force the hidden plan into a riskier timetable.",
        provenance: {
          basis: "agent_proposed",
          premiseIds: ["premise.melantho_hostility", "premise.palace_danger"],
          reviewState: "creator_approved",
          canonStatus: "not_source_canon",
          creatorApprovalReceiptId: "receipt.d6.night_of_the_scar",
          creatorDecisionId: "decision.d6-5",
        },
        conditions: [
          { kind: "flag_equals", flagId: "flag.plan_compromised", value: true },
        ],
        terminal: true,
      },
      {
        id: "ending.timeout",
        kind: "timeout",
        priority: 1,
        summary: "The sixth turn closes the night with unresolved knowledge and preserves every accumulated consequence for a later session.",
        provenance: {
          basis: "agent_proposed",
          premiseIds: [],
          reviewState: "creator_approved",
          canonStatus: "not_source_canon",
          creatorApprovalReceiptId: "receipt.d6.night_of_the_scar",
          creatorDecisionId: "decision.d6-5",
        },
        conditions: [{ kind: "turn_at_least", turn: 6 }],
        terminal: true,
      },
    ],
  } satisfies WorldSimulationScenario);

export const getOdysseyBook19WorldSimulation = (): WorldSimulationScenario =>
  structuredClone(ODYSSEY_BOOK_19_WORLD_SIMULATION);
