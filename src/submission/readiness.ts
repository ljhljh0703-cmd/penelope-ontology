import { z } from "zod";

const safeHttpsUrl = (
  label: string,
  validate: (url: URL) => boolean,
) =>
  z.string().superRefine((value, context) => {
    try {
      const url = new URL(value);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !validate(url)
      ) {
        context.addIssue({
          code: "custom",
          message: `${label} is not an allowed public HTTPS URL.`,
        });
      }
    } catch {
      context.addIssue({ code: "custom", message: `${label} is invalid.` });
    }
  });

const GitHubRepositoryUrlSchema = safeHttpsUrl(
  "Public repository URL",
  (url) =>
    url.hostname === "github.com" &&
    url.search === "" &&
    url.hash === "" &&
    url.pathname.split("/").filter(Boolean).length === 2,
);

const HostedOriginUrlSchema = safeHttpsUrl(
  "Hosted demo URL",
  (url) =>
    [
      ".vercel.app",
      ".netlify.app",
      ".pages.dev",
      ".github.io",
      ".web.app",
      ".onrender.com",
      ".railway.app",
      ".fly.dev",
    ].some((suffix) => url.hostname.endsWith(suffix)) &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "",
);

const YouTubeUrlSchema = safeHttpsUrl(
  "YouTube URL",
  (url) =>
    ["youtube.com", "www.youtube.com", "youtu.be"].includes(url.hostname) &&
    url.hash === "",
);

const DevpostUrlSchema = safeHttpsUrl(
  "Devpost URL",
  (url) =>
    url.hostname === "devpost.com" &&
    url.pathname.startsWith("/software/") &&
    url.hash === "",
);

export const ExternalSubmissionRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    final: z
      .object({
        projectName: z.string().trim().min(2).max(80).nullable(),
        track: z.literal("Work & Productivity"),
        descriptionFinal: z.boolean(),
      })
      .strict(),
    publicRepository: z
      .object({
        url: GitHubRepositoryUrlSchema.nullable(),
        branch: z.literal("main"),
      })
      .strict(),
    hostedDemo: z
      .object({
        url: HostedOriginUrlSchema.nullable(),
      })
      .strict(),
    video: z
      .object({
        url: YouTubeUrlSchema.nullable(),
        narrationConfirmed: z.boolean(),
        productDemoConfirmed: z.boolean(),
        codexUseExplained: z.boolean(),
        gpt56UseExplained: z.boolean(),
      })
      .strict(),
    feedback: z
      .object({
        sessionId: z
          .string()
          .regex(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
          )
          .nullable(),
        taskModel: z.literal("gpt-5.6").nullable().default(null),
      })
      .strict(),
    devpost: z
      .object({
        projectUrl: DevpostUrlSchema,
        trackConfirmed: z.boolean(),
        submittedAt: z.iso.datetime().nullable(),
        submissionUrl: DevpostUrlSchema.nullable(),
        submissionReadbackMethod: z
          .enum(["authenticated_devpost", "devpost_plugin"])
          .nullable(),
        readback: z
          .object({
            projectName: z.string().trim().min(2).max(80).nullable(),
            track: z.literal("Work & Productivity").nullable(),
            descriptionSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
            repositoryUrl: GitHubRepositoryUrlSchema.nullable(),
            hostedDemoUrl: HostedOriginUrlSchema.nullable(),
            videoUrl: YouTubeUrlSchema.nullable(),
          })
          .strict(),
      })
      .strict(),
    claims: z
      .object({
        measuredStyleControl: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type ExternalSubmissionRecord = z.infer<
  typeof ExternalSubmissionRecordSchema
>;

export type SubmissionPhase = "pre-submit" | "post-submit";

export type SubmissionObservation = {
  submissionRecordValid: boolean;
  releaseRecordValid: boolean;
  worktreeClean: boolean;
  releaseShaMatchesHead: boolean;
  privatePathsUntracked: boolean;
  evidenceManifestMatches: boolean;
  galleryManifestMatches: boolean;
  privacyScanPassed: boolean;
  liveEvidenceVerified: boolean;
  liveGpt56NarrativeClaimRequested: boolean;
  codexGpt56TaskDesignationPresent: boolean;
  finalNameParity: boolean;
  projectDescriptionFinal: boolean;
  readmePresent: boolean;
  licensePresent: boolean;
  publicRemoteHeadMatches: boolean;
  publicCiPassed: boolean;
  hostedDemoSmokePassed: boolean;
  youtubePublicUnderThreeMinutes: boolean;
  youtubeNarrationConfirmed: boolean;
  youtubeRequiredContentConfirmed: boolean;
  feedbackSessionPresent: boolean;
  devpostPageReachable: boolean;
  devpostTrackConfirmed: boolean;
  styleClaimContractMatches: boolean;
  crossModelSuperiorityClaimAbsent: boolean;
  measuredStyleClaimRequested: boolean;
  styleAblationVerified: boolean;
  devpostSubmitted: boolean;
};

export type SubmissionReadinessCheck = {
  id: string;
  required: boolean;
  passed: boolean;
};

export type SubmissionReadinessResult = {
  phase: SubmissionPhase;
  ready: boolean;
  checks: SubmissionReadinessCheck[];
};

export type ProjectNameSurfaces = {
  readme: string;
  appLayout: string;
  devpostDraft: string;
  submissionFields: string;
  videoNarration: string;
  startHere: string;
};

const captureName = (source: string, pattern: RegExp): string | null =>
  source.match(pattern)?.[1]?.trim() ?? null;

const stripNonVisibleMarkdown = (source: string): string => {
  const withoutComments = source.replace(
    /<!--[\s\S]*?(?:-->|$)/g,
    (comment) => (/\r|\n/.test(comment) ? "\n" : " "),
  );
  const lines = withoutComments.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? [];
  let activeFence: { marker: "`" | "~"; length: number } | null = null;

  return lines
    .map((line) => {
      const lineEnding = line.match(/(?:\r\n|\r|\n)$/)?.[0] ?? "";
      if (activeFence) {
        const closePattern = new RegExp(
          `^[ \\t]{0,3}\\${activeFence.marker}{${activeFence.length},}[ \\t]*(?:\\r\\n|\\r|\\n)?$`,
        );
        if (closePattern.test(line)) {
          activeFence = null;
        }
        return "";
      }

      const opening = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
      if (opening) {
        const delimiter = opening[1]!;
        activeFence = {
          marker: delimiter[0] as "`" | "~",
          length: delimiter.length,
        };
        return lineEnding;
      }

      return line;
    })
    .join("");
};

export const hasStructuredProjectNameParity = (
  projectName: string,
  surfaces: ProjectNameSurfaces,
): boolean => {
  const names = [
    captureName(surfaces.readme, /^# ([^\r\n]+)$/m),
    captureName(
      surfaces.appLayout,
      /title:\s*["']([^"']+) — (?:Causal World Simulator|Story Workbench|Table Rehearsal)["']/,
    ),
    captureName(surfaces.devpostDraft, /^Project name: ([^\r\n]+)$/m),
    captureName(
      surfaces.submissionFields,
      /^- \*\*Project name:\*\* ([^\r\n]+)$/m,
    ),
    captureName(surfaces.videoNarration, /^Project name: ([^\r\n]+)$/m),
  ];
  const candidateLanguage = `${surfaces.startHere}\n${surfaces.submissionFields}`;
  return (
    names.every((name) => name === projectName) &&
    !/project name candidate|final product name is intentionally undecided|name remains a candidate/i.test(
      candidateLanguage,
    )
  );
};

export const hasFinalProjectDescription = (
  projectName: string,
  source: string,
): boolean => {
  const visibleSource = stripNonVisibleMarkdown(source);
  const declaredName = captureName(visibleSource, /^Project name: ([^\r\n]+)$/m);
  const staleDraftLanguage =
    /pre-live|project name candidate|final submission remains blocked|not yet been captured|add (?:github actions|gpt-5\.6).{0,80}\bafter\b|current prohibited wording|current evidence-safe list/i;
  const requiredSections = [
    "## What it is",
    "## How it works",
    "## Demo",
    "## Hardest problem",
    "## Why Codex and GPT-5.6",
    "## Built with",
  ];
  const sectionMatches = [...visibleSource.matchAll(/^## ([^\r\n]+)$/gm)];
  const sectionHeadings = sectionMatches.map((match) => `## ${match[1]}`);
  const sectionBodies = sectionMatches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = sectionMatches[index + 1]?.index ?? visibleSource.length;
    return visibleSource.slice(start, end).trim();
  });
  const minimumSectionLengths = [100, 160, 100, 140, 180, 40] as const;
  const requiredSectionAnchors = [
    [/\bcreator\b/i, /\b(?:narrative|scene|world)\b/i, /\bharness\b/i],
    [/\b(?:participant|intent)\b/i, /\b(?:validator|validation|check)\b/i, /\bcreator\b/i],
    [/\b(?:demo|fixture|frozen|Ithaca|Penelope|Telemachus)\b/i, /\b(?:scene|intent|replay)\b/i],
    [/\b(?:false authority|knowledge|canon|invariant)\b/i, /\b(?:fluent|invented|conflict)\b/i],
    [/\bCodex\b/i, /\bGPT-5\.6\b/i, /\b(?:schema|validator|harness|evidence)\b/i],
    [/\bCodex\b/i, /\bGPT-5\.6\b/i, /\b(?:TypeScript|Next\.js|Zod|Vitest|Playwright)\b/i],
  ] as const;
  const sectionsAreSubstantive =
    JSON.stringify(sectionHeadings) === JSON.stringify(requiredSections) &&
    sectionBodies.every(
      (body, index) => {
        const tokens = body.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu) ?? [];
        const minimumTokens = index === minimumSectionLengths.length - 1 ? 6 : 12;
        const lexicalDiversity =
          tokens.length === 0 ? 0 : new Set(tokens).size / tokens.length;
        return (
          body.length >= minimumSectionLengths[index] &&
          tokens.length >= minimumTokens &&
          lexicalDiversity >= 0.35 &&
          requiredSectionAnchors[index]!.every((anchor) => anchor.test(body)) &&
          !/\b(?:lorem ipsum|placeholder|todo|tbd)\b/i.test(body) &&
          !/(\S)\1{19,}/u.test(body)
        );
      },
    );
  return (
    visibleSource.startsWith("# Devpost project description — final\n") &&
    declaredName === projectName &&
    visibleSource.length >= 1_000 &&
    sectionsAreSubstantive &&
    visibleSource.includes(
      "The model proposes, the harness constrains and traces, and the creator decides.",
    ) &&
    !staleDraftLanguage.test(visibleSource)
  );
};

export type ReleaseClaimLanguage = {
  liveGpt56NarrativeGeneration: boolean;
  measuredStyleEffect: boolean;
  crossModelSuperiority: boolean;
};

export const inspectReleaseClaimLanguage = (
  sources: readonly string[],
): ReleaseClaimLanguage => {
  const splitClauses = (source: string): string[] =>
    source
      .split(/(?<=[.!?])\s+|[\r\n]+/)
      .flatMap((sentence) =>
        sentence.split(
          /(?:[,;:]\s*|\s+)(?:but|however|nevertheless)\s+|[,;:]\s*yet\s+/i,
        ),
      )
      .map((clause) => clause.trim())
      .filter(Boolean);
  const clauseStreams = sources.map(splitClauses);
  const clauses = clauseStreams.flat();

  const hasUnnegatedMatch = (clause: string, pattern: RegExp): boolean => {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const matcher = new RegExp(pattern.source, flags);
    const fragmentBoundary =
      /[;:!?]\s*|\.(?!\d)\s*|\b(?:but|however|yet|nevertheless)\b\s*/gi;
    const localNegation =
      /\b(?:no|not|never|without|unsupported|unmeasured|cannot|can't|doesn't|does not|did not|is not|are not|do not|don't|must not)\b(?:\W+\w+){0,4}\W*$/i;

    for (const match of clause.matchAll(matcher)) {
      if (match.index === undefined) continue;
      const beforeMatch = clause.slice(0, match.index);
      let fragmentStart = 0;
      for (const boundary of beforeMatch.matchAll(fragmentBoundary)) {
        if (boundary.index !== undefined) {
          fragmentStart = boundary.index + boundary[0].length;
        }
      }
      const localPrefix = beforeMatch.slice(fragmentStart).slice(-80);
      const matchIsInsideNegatedQuote =
        /\b(?:no|not|never)\s+[“"][^”"]*$/i.test(localPrefix);
      const matchIsInsideNegatedAssertion =
        /\b(?:would|does|do|did|can|could|is|are)?\s*not\s+(?:prove|establish|show|claim)\b.*$/i.test(
          localPrefix,
        );
      const afterMatch = clause.slice(match.index + match[0].length);
      const nextBoundaryOffset = afterMatch.search(/[;:!?]|\.(?!\d)/u);
      const fragmentEnd =
        nextBoundaryOffset === -1
          ? clause.length
          : match.index + match[0].length + nextBoundaryOffset;
      const localFragment = clause.slice(fragmentStart, fragmentEnd).trim();
      const fragmentIsNegativeClaim =
        /^(?:[-*]\s*)?no\b/i.test(localFragment) &&
        /\b(?:claim(?:ed|s)?|result|evidence)\b/i.test(localFragment);
      const fragmentIsNegativeDirective =
        /^(?:[-*]\s*)?(?:do not|don't|never|must not|cannot|can't)\b/i.test(
          localFragment,
        );
      const fragmentIsExplicitBoundary =
        /\bnot a better[- ]writer claim\b/i.test(localFragment) ||
        /\bnot\b.*\bbenchmark\b.*\bevidence\b.*\bbetter writer\b/i.test(
          localFragment,
        );
      if (
        !localNegation.test(localPrefix) &&
        !matchIsInsideNegatedQuote &&
        !matchIsInsideNegatedAssertion &&
        !fragmentIsNegativeClaim &&
        !fragmentIsNegativeDirective &&
        !fragmentIsExplicitBoundary
      ) {
        return true;
      }
    }
    return false;
  };
  const measuredPattern =
    /(?:\bmeasur(?:e|ed|ing)\b.{0,120}\b(?:improvement|gain|increase|lift|better|higher|more distinctive)\b|\b\d+(?:\.\d+)?\s*%\b.{0,120}\b(?:improvement|gain|increase|lift|better|higher)\b|\b(?:raised|increased|improved|lifted|strengthened)\b.{0,80}\b(?:style|prose|writing|voice|narrative|distinctiveness|quality|score|rating|rubric)\b|\bimproves?\b.{0,40}\b(?:style|prose|writing|voice|narrative|distinctiveness|quality)\b|\b(?:style|prose|writing|voice|narrative|distinctiveness)(?:\s+quality)?\b.{0,80}\b(?:improved|increased|rose|grew|strengthened|improvement|gain|lift|better|higher|more distinctive)\b|\b(?:made|makes)\b.{0,50}\b(?:style|prose|writing|voice|narrative)\b.{0,30}\b(?:more distinctive|better|stronger|higher)\b|\b(?:style|prose|writing|voice|narrative|score|rating|rubric)(?:\s+quality)?\b.{0,80}\bfrom\s+\d+(?:\.\d+)?\s+to\s+\d+(?:\.\d+)?\b|\b(?:score|rating|rubric)\s+(?:delta|gain)\s*(?:of|=|:)?\s*[+]?(?:\d+(?:\.\d+)?)\b)/i;
  const crossModelPattern =
    /\b(?:(?:outperform(?:s|ed|ing)?|beats?|beating|superior to)\b.{0,60}?\b(?:models?|writing systems?|Fable|Opus)\b|writes? better than|stronger (?:at|in) (?:prose|writing) than|better (?:prose|writing) than|more distinctive than|(?:closed|narrowed|eliminated)\b.{0,60}?\bgap\b.{0,60}?\b(?:with|to)\s+(?:Fable|Opus)|(?:matches?|rivals?|surpasses?|exceeds?)\s+(?:Fable|Opus)|on par with\s+(?:Fable|Opus))\b/i;
  const gpt56MentionPattern = /\bGPT-5\.6(?:-[A-Za-z0-9._-]+)?\b/i;
  const narrativeContextPattern =
    /\b(?:author(?:ed|ing)?|chapter|compos(?:e|ed|ing)|creat(?:e|ed|ing|ion)|dialogue|draft(?:ed|ing)?|generat(?:e|ed|ing|ion)|opening|output|passage|produc(?:e|ed|ing)|prose|render(?:ed|ing)?|response|scene|story|text|writ(?:e|es|ing|ten)|wrote|narrative)\b/i;
  const requestedModelBoundary = (clause: string): boolean =>
    /(?:\brequest(?:ed|s|ing)?\b|\brequestedModel\b).{0,50}\bGPT-5\.6(?:-[A-Za-z0-9._-]+)?\b/i.test(
      clause,
    );
  const explicitGptAuthorship = (clause: string): boolean =>
    /(?:\b(?:used|using)\s+GPT-5\.6(?:-[A-Za-z0-9._-]+)?\s+to\s+(?:author|compose|create|draft|generate|produce|render|write)\b|\b(?:used|using)\s+GPT-5\.6(?:-[A-Za-z0-9._-]+)?\s+for\s+.{0,50}\b(?:chapter|dialogue|opening|passage|prose|scene|story|text|narrative)\b.{0,30}\b(?:authoring|composition|creation|drafting|generation|writing)\b|\bGPT-5\.6(?:-[A-Za-z0-9._-]+)?\b.{0,80}\b(?:authored|composed|created|drafted|generated|produced|rendered|wrote)\b.{0,80}\b(?:chapter|dialogue|opening|passage|prose|scene|story|text|narrative)\b|\b(?:chapter|dialogue|opening|passage|prose|scene|story|text|narrative)\b.{0,80}\b(?:came|comes)\s+from\s+GPT-5\.6(?:-[A-Za-z0-9._-]+)?\b|\b(?:chapter|dialogue|opening|passage|prose|scene|story|text|narrative)\b.{0,80}\bwritten\s+live\s+(?:by|with|using)\s+GPT-5\.6(?:-[A-Za-z0-9._-]+)?\b|\b(?:chapter|dialogue|opening|passage|prose|scene|story|text|narrative)\b.{0,40}\blive\s+GPT-5\.6(?:-[A-Za-z0-9._-]+)?\s+creation\b)/i.test(
      clause,
    );
  const directlyNegatedGptAuthorship = (clause: string): boolean =>
    /(?:\bGPT-5\.6(?:-[A-Za-z0-9._-]+)?\b.{0,60}\bdid\s+not\s+(?:author|compose|create|draft|generate|produce|render|write)\b.{0,80}\b(?:chapter|dialogue|opening|passage|prose|scene|story|text|narrative)\b|\bGPT-5\.6(?:-[A-Za-z0-9._-]+)?\b.{0,60}\bnever\s+(?:authored|composed|created|drafted|generated|produced|rendered|wrote)\b.{0,80}\b(?:chapter|dialogue|opening|passage|prose|scene|story|text|narrative)\b|\b(?:chapter|dialogue|opening|passage|prose|scene|story|text|narrative)\b.{0,60}\b(?:was|were|is|are)\s+(?:not|never)\s+(?:authored|composed|created|drafted|generated|produced|rendered|written)\b.{0,60}\b(?:by|from|using|with)\s+GPT-5\.6(?:-[A-Za-z0-9._-]+)?\b|\b(?:did\s+not\s+use|never\s+used?)\s+GPT-5\.6(?:-[A-Za-z0-9._-]+)?\b.{0,80}\b(?:author|compose|create|draft|generate|produce|render|write)\b|\bGPT-5\.6(?:-[A-Za-z0-9._-]+)?\b.{0,40}\b(?:was|is)\s+not\s+used\b.{0,80}\b(?:author|compose|create|draft|generate|produce|render|write)\b|\b(?:chapter|dialogue|opening|passage|prose|scene|story|text|narrative)\b.{0,40}\bdid\s+not\s+come\s+from\s+GPT-5\.6(?:-[A-Za-z0-9._-]+)?\b|\b(?:used|using)\s+GPT-5\.6(?:-[A-Za-z0-9._-]+)?\s+for\s+implementation\b.{0,60}\bnot\s+(?:for\s+)?(?:story|prose|text|narrative)?\s*(?:authoring|composition|creation|drafting|generation|writing)\b)/i.test(
      clause,
    );
  const modelPronounAuthorship = (clause: string): boolean =>
    /\b(?:that\s+model|the\s+(?:requested\s+)?model|this\s+model)\s+(?:authored|composed|created|drafted|generated|produced|rendered|wrote)\b.{0,80}\b(?:chapter|dialogue|opening|passage|prose|scene|story|text|narrative)\b/i.test(
      clause,
    );
  const ambiguousItAuthorship = (clause: string): boolean =>
    /\bit\s+(?:authored|composed|created|drafted|generated|produced|rendered|wrote)\b.{0,80}\b(?:chapter|dialogue|opening|passage|prose|scene|story|text|narrative)\b/i.test(
      clause,
    );
  const negatedPronounAuthorship = (clause: string): boolean =>
    /\b(?:it|that\s+model|the\s+(?:requested\s+)?model|this\s+model)\s+(?:did\s+not|never)\s+(?:author|compose|create|draft|generate|produce|render|write)\b/i.test(
      clause,
    );
  const gptPronounAntecedent = (clause: string): boolean =>
    gpt56MentionPattern.test(clause) &&
    /\b(?:configured|designated|requested|selected)\b/i.test(clause);
  const canonicalCliRunAntecedent = (clause: string): boolean =>
    /\b(?:ChatGPT-authenticated\s+)?Codex CLI(?:\s+run)?\b|\bStory Workbench run\b/i.test(
      clause,
    );
  const codexTaskDesignationBoundary = (clause: string): boolean =>
    /\bCodex\b.{0,80}\b(?:configured|designated|selected)\b.{0,40}\bGPT-5\.6\b/i.test(
      clause,
    ) && /\b(?:feedback|implementation|task)\b/i.test(clause);
  const implementationOrCapabilityBoundary = (clause: string): boolean =>
    /\b(?:adapter|bounded|candidate|contract|engine|fixture|gate|gated|implement(?:ation|ed|ing)?|protocol|schema|Structured Outputs?|task)\b/i.test(
      clause,
    );
  const negatedLiveNarrativeBoundary = (clause: string): boolean =>
    /^(?:[-*]\s*)?(?:do not|don't|never|must not|cannot|can't|neither)\b/i.test(
      clause,
    ) ||
    /\b(?:not|never|wasn't|weren't|isn't|aren't|hasn't|haven't|hadn't)\s+(?:authored|captured|drafted|generated|produced|rendered|verified|written)\b.{0,100}\bGPT-5\.6(?:-[A-Za-z0-9._-]+)?\b/i.test(
      clause,
    ) ||
    /\bGPT-5\.6(?:-[A-Za-z0-9._-]+)?\b.{0,120}\b(?:not|never|wasn't|weren't|isn't|aren't|hasn't|haven't|hadn't)(?:\s+yet)?(?:\s+been)?\s+(?:authored|captured|drafted|generated|produced|rendered|verified|written)\b/i.test(
      clause,
    ) ||
    /\b(?:does|do|did|would|can|could|is|are|was|were)\s+not\s+(?:claim|establish|prove|show)\b.{0,120}\bGPT-5\.6(?:-[A-Za-z0-9._-]+)?\b/i.test(
      clause,
    ) ||
    /\bnot\s+(?:a\s+)?(?:live\s+)?GPT-5\.6(?:-[A-Za-z0-9._-]+)?\b.{0,40}\b(?:claim|creation|generation|response|result)\b/i.test(
      clause,
    ) ||
    /\bno\s+(?:live\s+|real\s+)?GPT-5\.6(?:-[A-Za-z0-9._-]+)?\b.{0,60}\b(?:generation|output|response|result)\b.{0,40}\b(?:captured|exists?|verified)\b/i.test(
      clause,
    ) ||
    /\b(?:blocked|pending)\b.{0,160}\b(?:GPT-5\.6|no|not|unverified|unknown|null)\b/i.test(
      clause,
    ) ||
    /\b(?:does|did|would|can|could)\s+not\s+(?:independently\s+)?(?:attribute|establish|identify|prove|show)\b/i.test(
      clause,
    );
  const approvedPerceptionSource = String.raw`\b(?:(?:its default|default Codex|Codex's default) prose may feel less distinctive (?:than|beside)(?: output from)?(?: writing-first systems)?(?: such as)?\s+(?:Fable|Opus)(?:\s*(?:or|and|\/)\s*(?:Fable|Opus))*|writing-first systems may feel more distinctive than generic default Codex prose)\b`;
  const stripApprovedPerception = (clause: string): string =>
    clause.replace(new RegExp(approvedPerceptionSource, "gi"), "");
  const approvedVendorBoundary = (clause: string): boolean =>
    new RegExp(approvedPerceptionSource, "i").test(clause) ||
    (/\bCodex is a weaker writer than Fable or Opus\b/i.test(clause) &&
      /\bengineering constraint\b/i.test(clause) &&
      /\bnot a benchmark\b/i.test(clause)) ||
    (/\b(?:not|no|never|without|do not|cannot|can't|does not|would not|make no)\b/i.test(
      clause,
    ) &&
      /\b(?:claim|comparison|benchmark|better|beats?|outperform|eclipses|rivals?|superior|superiority|prove|establish|evidence|writer|writing quality)\b/i.test(
        clause,
      ));
  const unapprovedVendorClaim = clauses.some(
    (clause) => /\b(?:Fable|Opus)\b/i.test(clause) && !approvedVendorBoundary(clause),
  );
  const unmeasuredOutcomePattern =
    /\b(?:harness|system|tool|project|style constraints?|Codex|GPT-5\.6)\b.{0,100}\b(?:produced|creates?|delivers?|achieves?|yields?|made|makes?)\b.{0,80}\b(?:more recognizable|more distinctive|better|stronger|higher-quality|improved)\b.{0,40}\b(?:voice|prose|writing|style|narrative)?/i;
  const claimBearingStreams = clauseStreams.map((stream) =>
    stream.map(stripApprovedPerception),
  );
  const claimBearingClauses = claimBearingStreams.flat();
  const isLiveGpt56NarrativeClaim = (clause: string): boolean => {
    if (
      !gpt56MentionPattern.test(clause) ||
      !narrativeContextPattern.test(clause)
    ) {
      return false;
    }
    if (directlyNegatedGptAuthorship(clause)) return false;
    if (explicitGptAuthorship(clause)) return true;
    if (
      requestedModelBoundary(clause) ||
      codexTaskDesignationBoundary(clause) ||
      implementationOrCapabilityBoundary(clause)
    ) {
      return false;
    }
    return !negatedLiveNarrativeBoundary(clause);
  };
  const contextualPronounClaim = claimBearingStreams.some((stream) =>
    stream.some((clause, index) => {
      if (!gptPronounAntecedent(clause)) return false;
      return [1, 2].some((offset) => {
        const candidate = stream[index + offset];
        if (candidate === undefined || negatedPronounAuthorship(candidate)) {
          return false;
        }
        if (modelPronounAuthorship(candidate)) return true;
        return (
          ambiguousItAuthorship(candidate) &&
          !canonicalCliRunAntecedent(clause)
        );
      });
    }),
  );
  return {
    liveGpt56NarrativeGeneration:
      claimBearingClauses.some(isLiveGpt56NarrativeClaim) ||
      contextualPronounClaim,
    measuredStyleEffect: claimBearingClauses.some(
      (clause) =>
        hasUnnegatedMatch(clause, measuredPattern) ||
        hasUnnegatedMatch(clause, unmeasuredOutcomePattern),
    ),
    crossModelSuperiority:
      unapprovedVendorClaim ||
      claimBearingClauses.some((clause) =>
        hasUnnegatedMatch(clause, crossModelPattern),
      ),
  };
};

export const evaluateSubmissionReadiness = (
  phase: SubmissionPhase,
  observation: SubmissionObservation,
): SubmissionReadinessResult => {
  const checks: SubmissionReadinessCheck[] = [
    { id: "submission_record_valid", required: true, passed: observation.submissionRecordValid },
    { id: "release_record_valid", required: true, passed: observation.releaseRecordValid },
    { id: "worktree_clean", required: true, passed: observation.worktreeClean },
    { id: "release_sha_matches_head", required: true, passed: observation.releaseShaMatchesHead },
    { id: "private_paths_untracked", required: true, passed: observation.privatePathsUntracked },
    { id: "evidence_manifest_matches", required: true, passed: observation.evidenceManifestMatches },
    { id: "gallery_manifest_matches", required: true, passed: observation.galleryManifestMatches },
    { id: "privacy_scan_passed", required: true, passed: observation.privacyScanPassed },
    {
      id: "live_gpt56_verified",
      required: observation.liveGpt56NarrativeClaimRequested,
      passed:
        !observation.liveGpt56NarrativeClaimRequested ||
        observation.liveEvidenceVerified,
    },
    {
      id: "codex_gpt56_task_designation_present",
      required: true,
      passed: observation.codexGpt56TaskDesignationPresent,
    },
    { id: "final_name_parity", required: true, passed: observation.finalNameParity },
    { id: "project_description_final", required: true, passed: observation.projectDescriptionFinal },
    { id: "readme_present", required: true, passed: observation.readmePresent },
    { id: "license_present", required: true, passed: observation.licensePresent },
    { id: "public_remote_head_matches", required: true, passed: observation.publicRemoteHeadMatches },
    { id: "public_ci_passed", required: true, passed: observation.publicCiPassed },
    { id: "hosted_demo_smoke_passed", required: true, passed: observation.hostedDemoSmokePassed },
    {
      id: "youtube_public_under_three_minutes",
      required: true,
      passed: observation.youtubePublicUnderThreeMinutes,
    },
    {
      id: "youtube_narration_confirmed",
      required: true,
      passed: observation.youtubeNarrationConfirmed,
    },
    {
      id: "youtube_required_content_confirmed",
      required: true,
      passed: observation.youtubeRequiredContentConfirmed,
    },
    { id: "feedback_session_present", required: true, passed: observation.feedbackSessionPresent },
    { id: "devpost_page_reachable", required: true, passed: observation.devpostPageReachable },
    { id: "devpost_track_confirmed", required: true, passed: observation.devpostTrackConfirmed },
    {
      id: "style_claim_contract_matches",
      required: true,
      passed: observation.styleClaimContractMatches,
    },
    {
      id: "cross_model_superiority_claim_absent",
      required: true,
      passed: observation.crossModelSuperiorityClaimAbsent,
    },
    {
      id: "style_ablation_verified_for_measured_claim",
      required: observation.measuredStyleClaimRequested,
      passed:
        !observation.measuredStyleClaimRequested || observation.styleAblationVerified,
    },
    {
      id: "devpost_final_submission_owner_readback",
      required: phase === "post-submit",
      passed: phase !== "post-submit" || observation.devpostSubmitted,
    },
  ];

  return {
    phase,
    checks,
    ready: checks.every(({ required, passed }) => !required || passed),
  };
};

export const formatSubmissionReadiness = (
  result: SubmissionReadinessResult,
): string => {
  const required = result.checks.filter(({ required: isRequired }) => isRequired);
  const failed = required.filter(({ passed }) => !passed);
  const summary = result.ready ? "PASS" : "BLOCKED";
  return [
    `SUBMISSION_READINESS_${summary} phase=${result.phase} passed=${required.length - failed.length}/${required.length}`,
    ...failed.map(({ id }) => `- ${id}`),
  ].join("\n");
};
