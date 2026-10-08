"use client";
import { Choices, StepTitle } from "../ui";
import type { FunnelState, Tri } from "../state";

type Condition = FunnelState["condition"];

const NO_YES_UNKNOWN: { value: Tri; label: string }[] = [
  { value: "no", label: "No" },
  { value: "yes", label: "Sì" },
  { value: "unknown", label: "Non so" },
];

export function ConditionStep({
  condition,
  onChange,
  errors,
}: {
  condition: Condition;
  onChange: (patch: Partial<Condition>) => void;
  errors: Record<string, string>;
}) {
  return (
    <>
      <StepTitle sub="Rispondi come sai: le verifichiamo insieme quando vediamo la moto.">In che condizioni è?</StepTitle>
      <div className="space-y-8">
        <Choices
          legend="La moto è funzionante?"
          name="isRunning"
          columns={2}
          value={condition.isRunning === undefined ? undefined : condition.isRunning ? "yes" : "no"}
          options={[
            { value: "yes", label: "Sì" },
            { value: "no", label: "No" },
          ]}
          onChange={(v) => onChange({ isRunning: v === "yes" })}
          error={errors.isRunning}
        />
        <Choices
          legend="Ha subito incidenti?"
          name="accident"
          value={condition.accident}
          options={NO_YES_UNKNOWN}
          onChange={(v) => onChange({ accident: v })}
          error={errors.accident}
        />
        <Choices
          legend="Ci sono problemi meccanici?"
          name="mechanicalIssues"
          value={condition.mechanicalIssues}
          options={NO_YES_UNKNOWN}
          onChange={(v) => onChange({ mechanicalIssues: v })}
          error={errors.mechanicalIssues}
        />
        <Choices
          legend="Hai fatto regolarmente la manutenzione?"
          name="maintenance"
          value={condition.maintenance}
          options={[
            { value: "yes", label: "Sì" },
            { value: "no", label: "No" },
            { value: "unknown", label: "Non so" },
          ]}
          onChange={(v) => onChange({ maintenance: v })}
          error={errors.maintenance}
        />
      </div>
    </>
  );
}
