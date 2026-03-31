"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus, Save } from "lucide-react";
import type { WidgetConfig, FormField } from "./types";
import { useAppState } from "./AppStateProvider";
import { useToast } from "./ToastProvider";

// Fetch dynamic options for select fields
async function fetchSelectOptions(field: FormField): Promise<string[]> {
  if (!field.optionsFrom) return [];
  try {
    const res = await fetch("/api/apps/widget-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: {
          entity: field.optionsFrom.entity,
          aggregation: "count",
          groupBy: field.optionsFrom.field,
          limit: 100,
        },
      }),
    });
    const data = await res.json();
    if (Array.isArray(data.data)) {
      return (data.data as { label: string }[]).map((r) => r.label).filter(Boolean).sort();
    }
  } catch {
    // ignore
  }
  return [];
}

function FieldInput({
  field,
  value,
  onChange,
  dynamicOptions,
}: {
  field: FormField;
  value: string;
  onChange: (key: string, val: string) => void;
  dynamicOptions: string[];
}) {
  const inputClass = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400";

  return (
    <div className={field.type === "textarea" ? "sm:col-span-2" : ""}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {field.label}
        {field.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>

      {field.type === "select" ? (
        <select
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          className={inputClass}
        >
          <option value="">{field.placeholder ?? "Select..."}</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
          {dynamicOptions.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={`${inputClass} resize-none`}
        />
      ) : (
        <input
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          step={field.type === "number" ? "any" : undefined}
          className={inputClass}
        />
      )}
    </div>
  );
}

export function FormWidget({ widget }: { widget: WidgetConfig }) {
  const { triggerRefresh } = useAppState();
  const toast = useToast();
  const fields = widget.formFields ?? [];
  const action = widget.formAction;

  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) {
      if (f.defaultValue !== undefined) init[f.key] = String(f.defaultValue);
    }
    return init;
  });
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);

  // Check if multi-step
  const totalSteps = useMemo(() => {
    const steps = fields.map((f) => f.step ?? 1);
    return Math.max(1, ...steps);
  }, [fields]);
  const isMultiStep = totalSteps > 1;

  // Visible fields (accounting for conditional visibility and current step)
  const visibleFields = useMemo(() => {
    return fields.filter((f) => {
      // Step filter
      const fieldStep = f.step ?? 1;
      if (isMultiStep && fieldStep !== currentStep) return false;
      // Conditional visibility
      if (f.showWhen) {
        const depVal = values[f.showWhen.field] ?? "";
        if (depVal !== f.showWhen.value) return false;
      }
      return true;
    });
  }, [fields, currentStep, isMultiStep, values]);

  // Fetch dynamic options
  useEffect(() => {
    for (const f of fields) {
      if (f.optionsFrom) {
        fetchSelectOptions(f).then((opts) => {
          setDynamicOptions((prev) => ({ ...prev, [f.key]: opts }));
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }, []);

  // Validate current step's required fields
  const validateCurrentStep = useCallback((): boolean => {
    for (const f of visibleFields) {
      if (f.required && !values[f.key]?.trim()) {
        setError(`${f.label} is required`);
        return false;
      }
    }
    return true;
  }, [visibleFields, values]);

  const handleNext = useCallback(() => {
    if (!validateCurrentStep()) return;
    setCurrentStep((s) => Math.min(totalSteps, s + 1));
    setError(null);
  }, [validateCurrentStep, totalSteps]);

  const handlePrev = useCallback(() => {
    setCurrentStep((s) => Math.max(1, s - 1));
    setError(null);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!action) return;

    // Validate all visible required fields (all steps)
    for (const f of fields) {
      // Skip hidden conditional fields
      if (f.showWhen) {
        const depVal = values[f.showWhen.field] ?? "";
        if (depVal !== f.showWhen.value) continue;
      }
      if (f.required && !values[f.key]?.trim()) {
        // If multi-step, navigate to the step with the error
        if (isMultiStep && f.step) setCurrentStep(f.step);
        setError(`${f.label} is required`);
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      const data: Record<string, unknown> = {};
      for (const f of fields) {
        const val = values[f.key];
        if (val === undefined || val === "") continue;
        if (f.type === "number") {
          data[f.key] = Number(val);
        } else if (f.type === "date") {
          data[f.key] = new Date(val).toISOString();
        } else {
          data[f.key] = val;
        }
      }

      const res = await fetch("/api/apps/widget-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: action.type,
          entity: action.entity,
          data,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error ?? `Failed (${res.status})`);
      }

      // Reset form
      const reset: Record<string, string> = {};
      for (const f of fields) {
        if (f.defaultValue !== undefined) reset[f.key] = String(f.defaultValue);
      }
      setValues(reset);
      setCurrentStep(1);
      triggerRefresh();
      toast.success(action.type === "update" ? "Updated successfully" : "Created successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{widget.title}</p>
          {widget.display?.description && (
            <p className="text-xs text-gray-400 mt-0.5">{widget.display.description}</p>
          )}
        </div>
        {isMultiStep && (
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i + 1 === currentStep
                    ? "bg-blue-500"
                    : i + 1 < currentStep
                    ? "bg-blue-300"
                    : "bg-gray-200"
                }`}
              />
            ))}
            <span className="text-xs text-gray-400 ml-1">Step {currentStep}/{totalSteps}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {visibleFields.map((f) => (
            <FieldInput
              key={f.key}
              field={f}
              value={values[f.key] ?? ""}
              onChange={handleChange}
              dynamicOptions={dynamicOptions[f.key] ?? []}
            />
          ))}
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex items-center justify-between">
          {isMultiStep && currentStep > 1 ? (
            <button
              type="button"
              onClick={handlePrev}
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            {isMultiStep && currentStep < totalSteps ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : action?.type === "update" ? (
                  <Save className="w-3.5 h-3.5" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                {action?.type === "update" ? "Update" : "Create"}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
