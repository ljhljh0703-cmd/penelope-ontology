import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  evaluateSubmissionReadiness,
  ExternalSubmissionRecordSchema,
  formatSubmissionReadiness,
  hasFinalProjectDescription,
  hasStructuredProjectNameParity,
  inspectReleaseClaimLanguage,
  type SubmissionObservation,
} from "@/src/submission/readiness";

const feedbackSessionId = [
  "019f4952",
  "26ec",
  "7ab3",
  "b393",
  "5bf78388a76a",
].join("-");

const completeRecord = {
  schemaVersion: 1,
  final: {
    projectName: "Narrative Knowledge Harness",
    track: "Work & Productivity",
    descriptionFinal: true,
  },
  publicRepository: {
    url: "https://github.com/example/narrative-harness",
    branch: "main",
  },
  hostedDemo: {
    url: "https://narrative-harness.vercel.app/",
  },
  video: {
    url: "https://www.youtube.com/watch?v=public-demo",
    narrationConfirmed: true,
    productDemoConfirmed: true,
    codexUseExplained: true,
    gpt56UseExplained: true,
  },
  feedback: {
    sessionId: feedbackSessionId,
    taskModel: "gpt-5.6",
  },
  devpost: {
    projectUrl: "https://devpost.com/software/narrative-ontology-harness",
    trackConfirmed: true,
    submittedAt: null,
    submissionUrl: null,
    submissionReadbackMethod: null,
    readback: {
      projectName: null,
      track: null,
      descriptionSha256: null,
      repositoryUrl: null,
      hostedDemoUrl: null,
      videoUrl: null,
    },
  },
  claims: {
    measuredStyleControl: false,
  },
} as const;

const passingObservation: SubmissionObservation = {
  submissionRecordValid: true,
  releaseRecordValid: true,
  worktreeClean: true,
  releaseShaMatchesHead: true,
  privatePathsUntracked: true,
  evidenceManifestMatches: true,
  galleryManifestMatches: true,
  privacyScanPassed: true,
  liveEvidenceVerified: false,
  liveGpt56NarrativeClaimRequested: false,
  codexGpt56TaskDesignationPresent: true,
  finalNameParity: true,
  projectDescriptionFinal: true,
  readmePresent: true,
  licensePresent: true,
  publicRemoteHeadMatches: true,
  publicCiPassed: true,
  hostedDemoSmokePassed: true,
  youtubePublicUnderThreeMinutes: true,
  youtubeNarrationConfirmed: true,
  youtubeRequiredContentConfirmed: true,
  feedbackSessionPresent: true,
  devpostPageReachable: true,
  devpostTrackConfirmed: true,
  styleClaimContractMatches: true,
  crossModelSuperiorityClaimAbsent: true,
  measuredStyleClaimRequested: false,
  styleAblationVerified: false,
  devpostSubmitted: false,
};

describe("submission readiness gate", () => {
  it("accepts a strict private record without exposing it publicly", () => {
    expect(ExternalSubmissionRecordSchema.parse(completeRecord)).toEqual(completeRecord);
    const legacyFeedbackRecord = {
      ...completeRecord,
      feedback: { sessionId: completeRecord.feedback.sessionId },
    };
    expect(ExternalSubmissionRecordSchema.parse(legacyFeedbackRecord).feedback).toEqual({
      sessionId: completeRecord.feedback.sessionId,
      taskModel: null,
    });
    expect(
      ExternalSubmissionRecordSchema.safeParse({
        ...completeRecord,
        publicRepository: {
          ...completeRecord.publicRepository,
          url: "https://user:secret@github.com/example/narrative-harness",
        },
      }).success,
    ).toBe(false);
    expect(
      ExternalSubmissionRecordSchema.safeParse({ ...completeRecord, unexpected: true }).success,
    ).toBe(false);
    expect(
      ExternalSubmissionRecordSchema.safeParse({
        ...completeRecord,
        feedback: {
          sessionId: "private-session-token",
          taskModel: "gpt-5.6",
        },
      }).success,
    ).toBe(false);
    expect(
      ExternalSubmissionRecordSchema.safeParse({
        ...completeRecord,
        feedback: {
          sessionId: feedbackSessionId,
          taskModel: "gpt-5.5",
        },
      }).success,
    ).toBe(false);
    expect(
      ExternalSubmissionRecordSchema.safeParse({
        ...completeRecord,
        hostedDemo: { url: "https://internal.example.com/" },
      }).success,
    ).toBe(false);
  });

  it("separates pre-submit readiness from final submission confirmation", () => {
    const preSubmit = evaluateSubmissionReadiness("pre-submit", passingObservation);
    expect(preSubmit.ready).toBe(true);
    expect(formatSubmissionReadiness(preSubmit)).toContain("passed=24/24");

    const postSubmit = evaluateSubmissionReadiness("post-submit", passingObservation);
    expect(postSubmit.ready).toBe(false);
    expect(postSubmit.checks).toContainEqual({
      id: "devpost_final_submission_owner_readback",
      required: true,
      passed: false,
    });
  });

  it("requires a GPT-5.6-designated Codex task with feedback while keeping live evidence claim-conditional", () => {
    const noLiveClaim = evaluateSubmissionReadiness(
      "pre-submit",
      passingObservation,
    );
    expect(noLiveClaim.ready).toBe(true);
    expect(noLiveClaim.checks).toContainEqual({
      id: "live_gpt56_verified",
      required: false,
      passed: true,
    });

    const supportedLiveClaim = evaluateSubmissionReadiness("pre-submit", {
      ...passingObservation,
      liveGpt56NarrativeClaimRequested: true,
      liveEvidenceVerified: true,
    });
    expect(supportedLiveClaim.ready).toBe(true);
    expect(formatSubmissionReadiness(supportedLiveClaim)).toContain(
      "passed=25/25",
    );

    const unsupportedLiveClaim = evaluateSubmissionReadiness("pre-submit", {
      ...passingObservation,
      liveGpt56NarrativeClaimRequested: true,
      liveEvidenceVerified: false,
    });
    expect(unsupportedLiveClaim.ready).toBe(false);
    expect(formatSubmissionReadiness(unsupportedLiveClaim)).toContain(
      "live_gpt56_verified",
    );

    const missingTaskDesignation = evaluateSubmissionReadiness("pre-submit", {
      ...passingObservation,
      codexGpt56TaskDesignationPresent: false,
    });
    expect(missingTaskDesignation.ready).toBe(false);
    expect(formatSubmissionReadiness(missingTaskDesignation)).toContain(
      "codex_gpt56_task_designation_present",
    );

    const missingFeedback = evaluateSubmissionReadiness("pre-submit", {
      ...passingObservation,
      feedbackSessionPresent: false,
      codexGpt56TaskDesignationPresent: false,
    });
    expect(missingFeedback.ready).toBe(false);
    expect(formatSubmissionReadiness(missingFeedback)).toContain(
      "feedback_session_present",
    );
    expect(formatSubmissionReadiness(missingFeedback)).toContain(
      "codex_gpt56_task_designation_present",
    );
  });

  it("fails closed on source, privacy, manifest, and hosted-SHA gaps", () => {
    const result = evaluateSubmissionReadiness("pre-submit", {
      ...passingObservation,
      worktreeClean: false,
      releaseShaMatchesHead: false,
      evidenceManifestMatches: false,
      privacyScanPassed: false,
      hostedDemoSmokePassed: false,
    });
    const failed = result.checks
      .filter(({ required, passed }) => required && !passed)
      .map(({ id }) => id);
    expect(failed).toEqual([
      "worktree_clean",
      "release_sha_matches_head",
      "evidence_manifest_matches",
      "privacy_scan_passed",
      "hosted_demo_smoke_passed",
    ]);
  });

  it("requires AB/BA proof only when a measured style-control claim is enabled", () => {
    const withoutClaim = evaluateSubmissionReadiness("pre-submit", passingObservation);
    expect(withoutClaim.ready).toBe(true);

    const withUnsupportedClaim = evaluateSubmissionReadiness("pre-submit", {
      ...passingObservation,
      measuredStyleClaimRequested: true,
      styleAblationVerified: false,
    });
    expect(withUnsupportedClaim.ready).toBe(false);
    expect(formatSubmissionReadiness(withUnsupportedClaim)).toContain(
      "style_ablation_verified_for_measured_claim",
    );
  });

  it("reports only stable check IDs, never private record values", () => {
    const result = evaluateSubmissionReadiness("pre-submit", {
      ...passingObservation,
      feedbackSessionPresent: false,
      publicRemoteHeadMatches: false,
    });
    const report = formatSubmissionReadiness(result);
    expect(report).toContain("feedback_session_present");
    expect(report).toContain("public_remote_head_matches");
    expect(report).not.toContain(completeRecord.feedback.sessionId);
    expect(report).not.toContain(completeRecord.publicRepository.url);
    expect(report).not.toContain(completeRecord.video.url);
  });

  it("compares structured project-name fields instead of generic substrings", () => {
    const surfaces = {
      readme: "# Narrative Knowledge Harness\n",
      appLayout: 'title: "Narrative Knowledge Harness — Story Workbench"',
      devpostDraft: "Project name: Narrative Knowledge Harness\n",
      submissionFields: "- **Project name:** Narrative Knowledge Harness\n",
      videoNarration: "Project name: Narrative Knowledge Harness\n",
      startHere: "The public release is finalized.\n",
    };
    expect(hasStructuredProjectNameParity("Narrative Knowledge Harness", surfaces)).toBe(
      true,
    );
    expect(
      hasStructuredProjectNameParity("Narrative Knowledge Harness", {
        ...surfaces,
        appLayout: 'title: "Narrative Knowledge Harness — Causal World Simulator"',
      }),
    ).toBe(true);
    expect(hasStructuredProjectNameParity("AI", surfaces)).toBe(false);
    expect(
      hasStructuredProjectNameParity("Narrative Knowledge Harness", {
        ...surfaces,
        submissionFields:
          "- **Project name candidate:** Narrative Knowledge Harness\nThe name remains a candidate.\n",
      }),
    ).toBe(false);
  });

  it("requires a final, substantive Devpost description surface without stale draft instructions", () => {
    const finalSource = [
      "# Devpost project description — final",
      "",
      "Project name: Narrative Knowledge Harness",
      "",
      "## What it is",
      "A creator-facing narrative production harness that keeps model-proposed scenes inside an inspectable world and style contract while leaving final judgment with the human author.",
      "## How it works",
      "Participant intent, creator style, character knowledge, canon rules, and current state enter as separate typed inputs. The model may propose a scene candidate, while deterministic validators check lineage, knowledge, state changes, and expansion boundaries before creator approval.",
      "## Demo",
      "A frozen Ithacan scene combines two registered participant intents, exposes what each character can know, and shows an expansion proposal moving through creator approval and replay checks.",
      "## Hardest problem",
      "Fluent prose can still become false authority. The implementation therefore separates subjective taste from hard invariants, carries evidence on every assertion, and turns missing or conflicting information into a visible decision instead of an invented bridge.",
      "## Why Codex and GPT-5.6",
      "Codex helped turn tacit writing standards into schemas, validators, adversarial tests, and release evidence. GPT-5.6 is bounded to a structured proposal role.",
      "The model proposes, the harness constrains and traces, and the creator decides.",
      "## Built with",
      "Codex, GPT-5.6, the OpenAI Responses API, TypeScript, Next.js, Zod, Vitest, Playwright, and GitHub Actions provide the implemented proposal, validation, evidence, and release path.",
      "",
    ].join("\n");
    expect(
      hasFinalProjectDescription("Narrative Knowledge Harness", finalSource),
    ).toBe(true);
    expect(
      hasFinalProjectDescription(
        "Narrative Knowledge Harness",
        finalSource.replace("— final", "— pre-live evidence-safe candidate"),
      ),
    ).toBe(false);
    expect(
      hasFinalProjectDescription(
        "Narrative Knowledge Harness",
        `${finalSource}Add GPT-5.6 after the live gate.\n`,
      ),
    ).toBe(false);
    expect(
      hasFinalProjectDescription(
        "Narrative Knowledge Harness",
        "# Devpost project description — final\n\nProject name: Narrative Knowledge Harness\n",
      ),
    ).toBe(false);
    expect(
      hasFinalProjectDescription(
        "Narrative Knowledge Harness",
        finalSource.replace(
          /## Demo\n[\s\S]*?\n## Hardest problem/,
          `## Demo\n${"x".repeat(1_000)}\n## Hardest problem`,
        ),
      ),
    ).toBe(false);
    const repeatedSection = "word ".repeat(220).trim();
    const repeatedSource = [
      "# Devpost project description — final",
      "",
      "Project name: Narrative Knowledge Harness",
      "",
      ...[
        "## What it is",
        "## How it works",
        "## Demo",
        "## Hardest problem",
        "## Why Codex and GPT-5.6",
        "## Built with",
      ].flatMap((heading) => [
        heading,
        heading === "## Why Codex and GPT-5.6"
          ? `${repeatedSection} The model proposes, the harness constrains and traces, and the creator decides.`
          : repeatedSection,
      ]),
      "",
    ].join("\n");
    expect(
      hasFinalProjectDescription("Narrative Knowledge Harness", repeatedSource),
    ).toBe(false);
    expect(
      hasFinalProjectDescription(
        "Narrative Knowledge Harness",
        finalSource.replace(
          "## How it works",
          "```text\n## Hidden decoy\ncreator narrative harness\n```\n## How it works",
        ),
      ),
    ).toBe(true);

    const hiddenCommentSource = [
      "# Devpost project description — final",
      "",
      "Project name: Narrative Knowledge Harness",
      "",
      "## What it is",
      `<!-- ${"creator narrative world harness distinctive ".repeat(30)} -->`,
      "## How it works",
      `<!-- ${"participant intent validator creator inspectable ".repeat(30)} -->`,
      "## Demo",
      `<!-- ${"frozen Ithaca scene replay registered ".repeat(30)} -->`,
      "## Hardest problem",
      `<!-- ${"false authority knowledge invariant fluent invented conflict ".repeat(30)} -->`,
      "## Why Codex and GPT-5.6",
      `<!-- ${"Codex GPT-5.6 schema validator harness evidence ".repeat(30)}`,
      "The model proposes, the harness constrains and traces, and the creator decides. -->",
      "## Built with",
      `<!-- ${"Codex GPT-5.6 TypeScript Next.js Zod Vitest Playwright ".repeat(30)} -->`,
      "",
    ].join("\n");
    expect(
      hasFinalProjectDescription(
        "Narrative Knowledge Harness",
        hiddenCommentSource,
      ),
    ).toBe(false);

    const hiddenFenceSource = hiddenCommentSource
      .replaceAll("<!-- ", "```text\n")
      .replaceAll(" -->", "\n```")
      .replace("creator decides. -->", "creator decides.\n```");
    expect(
      hasFinalProjectDescription(
        "Narrative Knowledge Harness",
        hiddenFenceSource,
      ),
    ).toBe(false);
  });

  it("separates a perception-led brief from measured or cross-model outcome claims", () => {
    expect(
      inspectReleaseClaimLanguage([
        "A familiar critique is that default Codex prose may feel less distinctive beside Fable or Opus. This is not a benchmark result.",
        "The mechanism has no measured prose improvement claim.",
      ]),
    ).toEqual({
      liveGpt56NarrativeGeneration: false,
      measuredStyleEffect: false,
      crossModelSuperiority: false,
    });
    expect(
      inspectReleaseClaimLanguage([
        "We measured a 40% prose-quality improvement and now outperform other writing systems.",
      ]),
    ).toEqual({
      liveGpt56NarrativeGeneration: false,
      measuredStyleEffect: true,
      crossModelSuperiority: true,
    });
    expect(
      inspectReleaseClaimLanguage([
        "This is not a benchmark, but it outperforms Fable.",
        "The style harness raised the human rubric score from 2.1 to 4.3.",
        "It is stronger at prose than Opus.",
        "The harness improved prose quality on the fixed probe.",
        "The style constraints made the voice more distinctive.",
        "Prose quality rose from 2.1 to 4.3.",
        "We closed the prose gap with Opus.",
        "Codex now matches Fable on narrative voice.",
        "Codex eclipses Opus for narrative prose.",
        "The harness consistently produced a more recognizable voice.",
      ]),
    ).toEqual({
      liveGpt56NarrativeGeneration: false,
      measuredStyleEffect: true,
      crossModelSuperiority: true,
    });
    expect(
      inspectReleaseClaimLanguage([
        "Do not say the system writes better than Fable or Opus.",
        "A favorable run would not prove that Codex or GPT-5.6 writes better than Fable or Opus.",
        "Live AB/BA is not measured, and no style improvement is claimed.",
        "No remote room, graph database, practitioner result, or measured productivity gain is claimed.",
      ]),
    ).toEqual({
      liveGpt56NarrativeGeneration: false,
      measuredStyleEffect: false,
      crossModelSuperiority: false,
    });
    expect(
      inspectReleaseClaimLanguage([
        "Default Codex prose may feel less distinctive beside Fable or Opus and this harness now outperforms Opus at narrative prose.",
      ]),
    ).toEqual({
      liveGpt56NarrativeGeneration: false,
      measuredStyleEffect: false,
      crossModelSuperiority: true,
    });
    expect(
      inspectReleaseClaimLanguage([
        "No measured style improvement is claimed; the harness improves prose quality.",
      ]),
    ).toEqual({
      liveGpt56NarrativeGeneration: false,
      measuredStyleEffect: true,
      crossModelSuperiority: false,
    });
    expect(
      inspectReleaseClaimLanguage([
        "Do not claim it outperforms Opus; the released harness outperforms Fable.",
        "A favorable run would not prove that Codex writes better than Opus; the released harness outperforms Fable.",
        "The harness does not improve prose quality.",
      ]),
    ).toEqual({
      liveGpt56NarrativeGeneration: false,
      measuredStyleEffect: false,
      crossModelSuperiority: true,
    });
    expect(
      inspectReleaseClaimLanguage([
        "Penelope's scene was written live with GPT-5.6.",
      ]),
    ).toEqual({
      liveGpt56NarrativeGeneration: true,
      measuredStyleEffect: false,
      crossModelSuperiority: false,
    });
    for (const positiveClaim of [
      "We used GPT-5.6 to write the scene.",
      "GPT-5.6 authored the opening scene.",
      "The opening scene came from GPT-5.6 in a live run.",
      "This story is a live GPT-5.6 creation.",
      "We requested GPT-5.6 and it generated the story.",
      "The task requested GPT-5.6; GPT-5.6 wrote the scene.",
      "We requested GPT-5.6. It wrote the scene.",
      "We requested GPT-5.6, which composed the story.",
      "The GPT-5.6 adapter composed the opening chapter.",
      "The narrative engine used GPT-5.6 for story creation.",
      "No benchmark was run, and GPT-5.6 wrote the scene.",
      "GPT-5.6 wrote the scene; actual model identity was not verified.",
      "We used GPT-5.6 to write the scene, though actual identity was not verified.",
      "We requested GPT-5.6.\n\nIt generated the opening story.",
      "GPT-5.6 was requested.\n\nThe model generated the opening story.",
      "Codex requested GPT-5.6. It generated the story.",
      "The run requested GPT-5.6. It wrote the scene.",
      "This task requested GPT-5.6. The model drafted the scene.",
      "The Codex CLI requested GPT-5.6. That model wrote the scene.",
      "The Story Workbench run requested GPT-5.6. The model generated the story.",
      "The Codex CLI run requested gpt-5.6-sol; actual model identity is unreported. That model authored the scene.",
      "The Codex CLI requested GPT-5.6. GPT-5.6 itself wrote the scene.",
      "The run requested GPT-5.6. The requested model drafted the scene.",
      "We selected GPT-5.6. This model composed the story.",
    ]) {
      expect(inspectReleaseClaimLanguage([positiveClaim])).toEqual({
        liveGpt56NarrativeGeneration: true,
        measuredStyleEffect: false,
        crossModelSuperiority: false,
      });
    }
    for (const safeBoundary of [
      "Codex was configured for GPT-5.6 and the private feedback session ID is supplied.",
      "The Codex CLI run requested gpt-5.6-sol; actual model identity is unreported.",
      "No live GPT-5.6 narrative response has been captured.",
      "The scene was not generated with GPT-5.6.",
      "The story was never written with GPT-5.6.",
      "A live GPT-5.6 narrative response was not captured.",
      "We did not use GPT-5.6 to write the scene.",
      "We never used GPT-5.6 to draft the story.",
      "The scene did not come from GPT-5.6.",
      "GPT-5.6 was not used to write this story.",
      "We used GPT-5.6 for implementation, not narrative generation.",
      "Codex used GPT-5.6 to implement the narrative engine.",
      "GPT-5.6 did not author the opening scene.",
      "The story was not created with GPT-5.6.",
      "GPT-5.6 never created this story.",
      "We requested GPT-5.6.\n\nIt did not generate the opening story.",
      "We requested GPT-5.6. The brief was reviewed. The schedule was approved. It generated the opening story.",
      "The Codex CLI run requested gpt-5.6-sol; actual model identity is unreported.",
      "The Codex CLI requested GPT-5.6. It did not write the scene.",
    ]) {
      expect(inspectReleaseClaimLanguage([safeBoundary])).toEqual({
        liveGpt56NarrativeGeneration: false,
        measuredStyleEffect: false,
        crossModelSuperiority: false,
      });
    }
    for (const locator of [
      "docs/submission/DEVPOST-DRAFT.md",
      "docs/submission/SUBMISSION-FIELDS.md",
      "docs/submission/VIDEO-NARRATION.md",
      "docs/JUDGE-GUIDE.md",
      "components/table/TableWorkbench.tsx",
    ]) {
      expect(
        inspectReleaseClaimLanguage([readFileSync(locator, "utf8")]),
        locator,
      ).toEqual({
        liveGpt56NarrativeGeneration: false,
        measuredStyleEffect: false,
        crossModelSuperiority: false,
      });
    }
  });
});
