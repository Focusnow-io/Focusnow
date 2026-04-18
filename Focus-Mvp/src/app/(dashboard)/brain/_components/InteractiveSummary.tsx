"use client";

import { OPERATOR_LABELS } from "../_lib/constants";

interface InteractiveSummaryProps {
  entity: string;
  condField: string;
  condOperator: string;
  condValue: string;
  /** When true, tokens are clickable and scroll to the form field */
  interactive?: boolean;
}

function Token({
  children,
  targetId,
  interactive,
}: {
  children: React.ReactNode;
  targetId: string;
  interactive: boolean;
}) {
  if (!interactive) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold">
        {children}
      </span>
    );
  }

  return (
    <button
      type="button"
      className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold hover:bg-blue-500/25 transition-colors cursor-pointer border border-blue-500/30 border-dashed"
      onClick={() => {
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          const focusable = el.querySelector<HTMLElement>(
            "button, input, textarea, [tabindex]"
          );
          if (focusable) {
            setTimeout(() => focusable.focus(), 300);
          }
        }
      }}
    >
      {children}
    </button>
  );
}

export default function InteractiveSummary({
  entity,
  condField,
  condOperator,
  condValue,
  interactive = false,
}: InteractiveSummaryProps) {
  const opLabel = OPERATOR_LABELS[condOperator] ?? condOperator;

  return (
    <p className="text-sm text-foreground font-medium leading-relaxed flex flex-wrap items-center gap-1">
      <span>When any</span>
      <Token targetId="field-entity" interactive={interactive}>
        {entity}
      </Token>
      <span>&rsquo;s</span>
      <Token targetId="field-condField" interactive={interactive}>
        {condField}
      </Token>
      <Token targetId="field-condOperator" interactive={interactive}>
        {opLabel}
      </Token>
      <Token targetId="field-condValue" interactive={interactive}>
        {condValue}
      </Token>
      <span>.</span>
    </p>
  );
}
