"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

const VARIANT_STYLES = {
  danger: {
    icon: <Trash2 className="w-5 h-5 text-red-500" />,
    bg: "bg-red-50",
    ring: "ring-red-100",
    btn: "bg-red-600 hover:bg-red-700 focus:ring-red-500",
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    bg: "bg-amber-50",
    ring: "ring-amber-100",
    btn: "bg-amber-600 hover:bg-amber-700 focus:ring-amber-500",
  },
  info: {
    icon: <AlertTriangle className="w-5 h-5 text-blue-500" />,
    bg: "bg-blue-50",
    ring: "ring-blue-100",
    btn: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500",
  },
};

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { open: boolean }) | null>(null);
  const resolveRef = useRef<((val: boolean) => void) | null>(null);

  const confirm: ConfirmFn = useCallback((options) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({ ...options, open: true });
    });
  }, []);

  const handleClose = useCallback((result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
  }, []);

  const v = state ? VARIANT_STYLES[state.variant ?? "danger"] : VARIANT_STYLES.danger;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {/* Modal overlay */}
      {state?.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => handleClose(false)}
          />

          {/* Dialog */}
          <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in zoom-in-95 fade-in duration-200">
            {/* Close button */}
            <button
              onClick={() => handleClose(false)}
              className="absolute top-3 right-3 p-1 rounded-lg text-muted-foreground hover:text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-6">
              {/* Icon */}
              <div className={`w-10 h-10 rounded-xl ${v.bg} ring-4 ${v.ring} flex items-center justify-center mb-4`}>
                {v.icon}
              </div>

              {/* Content */}
              <h3 className="text-lg font-semibold text-foreground mb-1">{state.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{state.message}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => handleClose(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-foreground bg-card border border-border rounded-xl hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                {state.cancelLabel ?? "Cancel"}
              </button>
              <button
                onClick={() => handleClose(true)}
                className={`flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${v.btn}`}
              >
                {state.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be inside ConfirmProvider");
  return ctx;
}
