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
  liveEvidenceVerified: true,
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
        feedback: { sessionId: "private-session-token" },
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

    const postSubmit = evaluateSubmissionReadiness("post-submit", passingObservation);
    expect(postSubmit.ready).toBe(false);
    expect(postSubmit.checks).toContainEqual({
      id: "devpost_final_submission_owner_readback",
      required: true,
      passed: false,
    });
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
      appLayout: 'title: "Narrative Knowledge Harness — Table Rehearsal"',
      devpostDraft: "Project name: Narrative Knowledge Harness\n",
      submissionFields: "- **Project name:** Narrative Knowledge Harness\n",
      videoNarration: "Project name: Narrative Knowledge Harness\n",
      startHere: "The public release is finalized.\n",
    };
    expect(hasStructuredProjectNameParity("Narrative Knowledge Harness", surfaces)).toBe(
      true,
    );
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
      measuredStyleEffect: false,
      crossModelSuperiority: false,
    });
    expect(
      inspectReleaseClaimLanguage([
        "We measured a 40% prose-quality improvement and now outperform other writing systems.",
      ]),
    ).toEqual({
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
      measuredStyleEffect: false,
      crossModelSuperiority: false,
    });
    expect(
      inspectReleaseClaimLanguage([
        "Default Codex prose may feel less distinctive beside Fable or Opus and this harness now outperforms Opus at narrative prose.",
      ]),
    ).toEqual({
      measuredStyleEffect: false,
      crossModelSuperiority: true,
    });
    expect(
      inspectReleaseClaimLanguage([
        "No measured style improvement is claimed; the harness improves prose quality.",
      ]),
    ).toEqual({
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
      measuredStyleEffect: false,
      crossModelSuperiority: true,
    });
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
        measuredStyleEffect: false,
        crossModelSuperiority: false,
      });
    }
  });
});
