"use client";

import { FormEvent, useMemo, useState } from "react";
import styles from "@/components/world/WorldForge.module.css";
import { WORLD_FORGE_FACT_FIELD_IDS } from "@/src/contracts/world-forge";
import type {
  WorldForgeCompileResponse,
  WorldForgeFactFieldId,
} from "@/src/contracts/world-forge";

type ForgeQuestion = {
  fieldId: Exclude<WorldForgeFactFieldId, "seedText">;
  label: string;
  question: string;
  helper: string;
  minLength: number;
  maxLength: number;
};

const QUESTIONS: readonly ForgeQuestion[] = [
  {
    fieldId: "title",
    label: "World title",
    question: "What should this small world be called?",
    helper: "Use a working title. You can rename the exported pack later.",
    minLength: 3,
    maxLength: 80,
  },
  {
    fieldId: "focalCharacterName",
    label: "Focal character",
    question: "Whose choice will drive this scene?",
    helper: "Name one character whose decision the creator will control.",
    minLength: 1,
    maxLength: 60,
  },
  {
    fieldId: "counterpartName",
    label: "Counterpart",
    question: "Who can answer, resist, or redirect that choice?",
    helper: "This character keeps a separate desire and knowledge boundary.",
    minLength: 1,
    maxLength: 60,
  },
  {
    fieldId: "locationName",
    label: "Scene location",
    question: "Where can this one scene be kept under control?",
    helper: "Choose one bounded location rather than an entire continent.",
    minLength: 3,
    maxLength: 80,
  },
  {
    fieldId: "immutableFact",
    label: "Immutable fact",
    question: "What fact must remain true, no matter which choice is made?",
    helper: "This is the rail Penelope will refuse to rewrite.",
    minLength: 12,
    maxLength: 420,
  },
  {
    fieldId: "focalDesire",
    label: "Focal desire",
    question: "What does the focal character want, and why must they act now?",
    helper: "Name a concrete desire with immediate pressure.",
    minLength: 12,
    maxLength: 420,
  },
  {
    fieldId: "counterpartDesire",
    label: "Counterpart desire",
    question: "What does the counterpart want for their own reasons?",
    helper: "Do not make this character a vending machine for the protagonist.",
    minLength: 12,
    maxLength: 420,
  },
  {
    fieldId: "stakes",
    label: "Stakes",
    question: "What can be lost if nobody reaches an agreement?",
    helper: "State the cost in a way the next scene could remember.",
    minLength: 12,
    maxLength: 420,
  },
  {
    fieldId: "knowledgeAsymmetry",
    label: "Hidden knowledge",
    question: "Who knows something the other character does not?",
    helper: "This stays behind the curtain until a declared consequence reveals it.",
    minLength: 12,
    maxLength: 420,
  },
  {
    fieldId: "forbiddenDevelopment",
    label: "Forbidden development",
    question: "What must Penelope refuse to invent or bypass?",
    helper: "Name the shortcut that would break your world or remove its cost.",
    minLength: 12,
    maxLength: 420,
  },
  {
    fieldId: "endingCondition",
    label: "Scene ending",
    question: "What must happen for this scene to be finished?",
    helper: "Give the rehearsal a real stopping point.",
    minLength: 12,
    maxLength: 420,
  },
  {
    fieldId: "acceptedCost",
    label: "Accepted cost",
    question: "What consequence may follow the focal character beyond this scene?",
    helper: "A cost makes approval meaningful instead of effortless.",
    minLength: 12,
    maxLength: 420,
  },
  {
    fieldId: "recommendedAction",
    label: "A · Recommended action",
    question: "What action best follows the current situation?",
    helper: "A is the most coherent recommendation, not automatically the safest route.",
    minLength: 3,
    maxLength: 80,
  },
  {
    fieldId: "recommendedConsequence",
    label: "A · World response",
    question: "If A happens, how does the world answer?",
    helper: "Describe an observable result, not a promise of success.",
    minLength: 12,
    maxLength: 420,
  },
  {
    fieldId: "alternativeAction",
    label: "B · Alternative action",
    question: "What genuinely different route should B offer?",
    helper: "B is contrast, not a compulsory high-risk or foolish choice.",
    minLength: 3,
    maxLength: 80,
  },
  {
    fieldId: "alternativeConsequence",
    label: "B · World response",
    question: "If B happens, how does the world answer differently?",
    helper: "Make the trade-off visible enough for a creator to judge.",
    minLength: 12,
    maxLength: 420,
  },
  {
    fieldId: "relationshipLabel",
    label: "Relationship",
    question: "How does the focal character currently relate to the counterpart?",
    helper: "Use a plain phrase such as trusts, owes, fears, protects, or suspects.",
    minLength: 2,
    maxLength: 64,
  },
  {
    fieldId: "relationshipAxis",
    label: "Relationship axis",
    question: "Which part of that relationship can the episode change?",
    helper: "Name one axis such as trust, suspicion, loyalty, debt, or fear.",
    minLength: 2,
    maxLength: 48,
  },
  {
    fieldId: "relationshipPressure",
    label: "Relationship pressure",
    question: "What would strengthen or damage this bond?",
    helper: "State a concrete behavior whose consequence can be recorded.",
    minLength: 12,
    maxLength: 420,
  },
  {
    fieldId: "sceneTwo",
    label: "Scene 2 · Pressure",
    question: "How does the first choice make the cost visible?",
    helper: "Describe the pressure inherited by the second scene.",
    minLength: 12,
    maxLength: 420,
  },
  {
    fieldId: "sceneThree",
    label: "Scene 3 · Turn",
    question: "What information or reversal changes the balance?",
    helper: "Give the episode a real turning point rather than more setup.",
    minLength: 12,
    maxLength: 420,
  },
  {
    fieldId: "sceneFour",
    label: "Scene 4 · Reckoning",
    question: "How do earlier choices return before the ending?",
    helper: "Bring back a cost, debt, suspicion, or promise already established.",
    minLength: 12,
    maxLength: 420,
  },
  {
    fieldId: "sceneFive",
    label: "Scene 5 · Resolution",
    question: "What final confrontation allows the world to answer?",
    helper: "Describe the situation in which the accumulated state earns an ending.",
    minLength: 12,
    maxLength: 420,
  },
] as const;

type ForgeValues = Partial<Record<WorldForgeFactFieldId, string>>;
type ForgeStage = "closed" | "seed" | "questions" | "review" | "compiling";

const sentenceCount = (value: string): number =>
  value.match(/[.!?](?=\s|$)/gu)?.length ?? 0;

const buildFact = (value: string) => ({
  value: value.trim(),
  origin: "creator_stated" as const,
  approval: "creator_approved" as const,
});

export function WorldForge({
  disabled,
  onOpenPack,
}: {
  disabled: boolean;
  onOpenPack: (definition: unknown) => Promise<boolean>;
}) {
  const [stage, setStage] = useState<ForgeStage>("closed");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [values, setValues] = useState<ForgeValues>({});
  const [answer, setAnswer] = useState("");
  const [canonApproved, setCanonApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const question = QUESTIONS[questionIndex] ?? null;
  const completedCount = Object.keys(values).length;

  const reviewFacts = useMemo(
    () =>
      [
        { fieldId: "seedText" as const, label: "Starting world" },
        ...QUESTIONS.map(({ fieldId, label }) => ({ fieldId, label })),
      ].map(({ fieldId, label }) => ({
        fieldId,
        label,
        value: values[fieldId] ?? "",
      })),
    [values],
  );

  const reset = () => {
    setStage("closed");
    setQuestionIndex(0);
    setValues({});
    setAnswer("");
    setCanonApproved(false);
    setError(null);
  };

  const submitSeed = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = answer.trim();
    const sentences = sentenceCount(next);
    if (next.length < 40 || next.length > 500 || sentences < 2 || sentences > 3) {
      setError("Write two or three complete sentences (40–500 characters). ");
      return;
    }
    setValues({ seedText: next });
    setAnswer("");
    setQuestionIndex(0);
    setError(null);
    setStage("questions");
  };

  const submitAnswer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!question) return;
    const next = answer.trim();
    if (next.length < question.minLength || next.length > question.maxLength) {
      setError(
        next.length > question.maxLength
          ? `Keep this answer within ${question.maxLength} characters.`
          : question.minLength === 1
          ? "Give this character a name."
          : `Answer with at least ${question.minLength} characters.`,
      );
      return;
    }
    const nextValues = { ...values, [question.fieldId]: next };
    setValues(nextValues);
    setAnswer("");
    setError(null);
    if (questionIndex === QUESTIONS.length - 1) {
      setStage("review");
      return;
    }
    setQuestionIndex((current) => current + 1);
  };

  const goBack = () => {
    setError(null);
    if (stage === "questions" && questionIndex === 0) {
      setAnswer(values.seedText ?? "");
      setStage("seed");
      return;
    }
    if (stage === "questions") {
      const previous = QUESTIONS[questionIndex - 1]!;
      setAnswer(values[previous.fieldId] ?? "");
      setQuestionIndex((current) => current - 1);
      return;
    }
    if (stage === "review") {
      const lastIndex = QUESTIONS.length - 1;
      setQuestionIndex(lastIndex);
      setAnswer(values[QUESTIONS[lastIndex]!.fieldId] ?? "");
      setStage("questions");
      setCanonApproved(false);
    }
  };

  const compile = async () => {
    if (!canonApproved || reviewFacts.some(({ value }) => value.length === 0)) return;
    setStage("compiling");
    setError(null);
    const field = (fieldId: WorldForgeFactFieldId) =>
      buildFact(values[fieldId] ?? "");
    const draft = {
      format: "penelope_world_forge_draft" as const,
      schemaVersion: 2 as const,
      draftId: `forge.browser_${Date.now()}`,
      approvedOn: new Date().toISOString().slice(0, 10),
      seedText: field("seedText"),
      title: field("title"),
      focalCharacterName: field("focalCharacterName"),
      counterpartName: field("counterpartName"),
      locationName: field("locationName"),
      immutableFact: field("immutableFact"),
      focalDesire: field("focalDesire"),
      counterpartDesire: field("counterpartDesire"),
      stakes: field("stakes"),
      knowledgeAsymmetry: field("knowledgeAsymmetry"),
      forbiddenDevelopment: field("forbiddenDevelopment"),
      endingCondition: field("endingCondition"),
      acceptedCost: field("acceptedCost"),
      recommendedAction: field("recommendedAction"),
      recommendedConsequence: field("recommendedConsequence"),
      alternativeAction: field("alternativeAction"),
      alternativeConsequence: field("alternativeConsequence"),
      relationshipLabel: field("relationshipLabel"),
      relationshipAxis: field("relationshipAxis"),
      relationshipPressure: field("relationshipPressure"),
      sceneTwo: field("sceneTwo"),
      sceneThree: field("sceneThree"),
      sceneFour: field("sceneFour"),
      sceneFive: field("sceneFive"),
    };

    try {
      const response = await fetch("/api/world/forge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const payload = (await response.json()) as
        | WorldForgeCompileResponse
        | { error?: { message?: string } };
      if (!response.ok || !("definition" in payload)) {
        throw new Error(
          "error" in payload
            ? payload.error?.message ?? "World Forge rejected this draft."
            : "World Forge rejected this draft.",
        );
      }
      const opened = await onOpenPack(payload.definition);
      if (!opened) throw new Error("The forged pack was sealed but its first scene did not open.");
      reset();
    } catch (caught) {
      setStage("review");
      setError(
        caught instanceof Error
          ? caught.message
          : "The approved facts could not be forged into a world pack.",
      );
    }
  };

  if (stage === "closed") {
    return (
      <section className={styles.closed} aria-labelledby="world-forge-heading">
        <div>
          <p>World Forge · inside Penelope</p>
          <h2 id="world-forge-heading">Bring two or three sentences. Leave with a five-scene world.</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            setStage("seed");
            setError(null);
          }}
          disabled={disabled}
          data-testid="world-forge-open"
        >
          Forge your world
        </button>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="world-forge-heading" data-testid="world-forge">
      <header>
        <div>
          <p>World Forge · Penelope creator beta</p>
          <h2 id="world-forge-heading">
            {stage === "seed"
              ? "Start with the world you already have."
              : stage === "review" || stage === "compiling"
                ? "Nothing becomes canon until you approve it."
                : question?.question}
          </h2>
        </div>
        <span>
          {stage === "seed"
            ? `01 / ${WORLD_FORGE_FACT_FIELD_IDS.length}`
            : stage === "questions"
              ? `${String(questionIndex + 2).padStart(2, "0")} / ${WORLD_FORGE_FACT_FIELD_IDS.length}`
              : `${WORLD_FORGE_FACT_FIELD_IDS.length} / ${WORLD_FORGE_FACT_FIELD_IDS.length}`}
        </span>
      </header>

      {stage === "seed" ? (
        <form onSubmit={submitSeed} className={styles.questionForm}>
          <label htmlFor="world-forge-answer">World and present situation</label>
          <textarea
            id="world-forge-answer"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Two or three sentences about the world, the people in the room, and the pressure already in motion."
            autoFocus
            data-testid="world-forge-answer"
          />
          <small>English-only renderer in this beta · no model call · no persistence</small>
          <div className={styles.actions}>
            <button type="button" onClick={reset}>Cancel</button>
            <button type="submit" data-testid="world-forge-next">Begin the questions</button>
          </div>
        </form>
      ) : null}

      {stage === "questions" && question ? (
        <form onSubmit={submitAnswer} className={styles.questionForm}>
          <label htmlFor="world-forge-answer">{question.label}</label>
          <textarea
            id="world-forge-answer"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder={question.helper}
            autoFocus
            data-testid="world-forge-answer"
          />
          <small>{question.helper}</small>
          <div className={styles.actions}>
            <button type="button" onClick={goBack}>Back</button>
            <button type="submit" data-testid="world-forge-next">
              {questionIndex === QUESTIONS.length - 1 ? "Review the world" : "Keep forging"}
            </button>
          </div>
        </form>
      ) : null}

      {stage === "review" || stage === "compiling" ? (
        <div className={styles.review}>
          <p className={styles.reviewIntro}>
            These are creator statements, not AI additions. Review the rails, relationship, five-scene spine, A/B actions, and consequences before Penelope seals them.
          </p>
          <ol data-testid="world-forge-review">
            {reviewFacts.map(({ fieldId, label, value }) => (
              <li key={fieldId}>
                <span>{label}</span>
                <p>{value}</p>
                <small>Creator stated · pending final approval</small>
              </li>
            ))}
          </ol>
          <label className={styles.approval}>
            <input
              type="checkbox"
              checked={canonApproved}
              onChange={(event) => setCanonApproved(event.target.checked)}
              disabled={stage === "compiling"}
              data-testid="world-forge-approve"
            />
            <span>I approve these {WORLD_FORGE_FACT_FIELD_IDS.length} facts as the canon for this five-scene episode.</span>
          </label>
          <div className={styles.actions}>
            <button type="button" onClick={goBack} disabled={stage === "compiling"}>Revise</button>
            <button
              type="button"
              onClick={() => void compile()}
              disabled={!canonApproved || stage === "compiling"}
              data-testid="world-forge-compile"
            >
              {stage === "compiling" ? "Sealing the world…" : "Approve, seal, and open scene one"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <footer>
        <span>{completedCount} creator answers held in this browser</span>
        <button type="button" onClick={reset}>Close World Forge</button>
      </footer>
    </section>
  );
}
