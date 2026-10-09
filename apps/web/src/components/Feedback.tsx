"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; text: string };
type ConfirmOptions = {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type Ctx = {
  toast: (kind: ToastKind, text: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<Ctx | null>(null);

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return ctx;
}

const ICON: Record<ToastKind, string> = { success: "✓", error: "!", info: "i" };
const TONE: Record<ToastKind, string> = {
  success: "bg-success",
  error: "bg-danger",
  info: "bg-primary",
};

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const nextId = useRef(1);
  const ref = useRef<HTMLDialogElement>(null);

  const toast = useCallback((kind: ToastKind, text: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3800);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...options, resolve })),
    [],
  );

  useEffect(() => {
    const el = ref.current;
    if (dialog && el && !el.open) el.showModal();
  }, [dialog]);

  function close(result: boolean) {
    dialog?.resolve(result);
    ref.current?.close();
    setDialog(null);
  }

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed right-4 top-20 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className="toast pointer-events-auto flex items-start gap-3 rounded-2xl border border-line bg-surface p-3 shadow-xl"
          >
            <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${TONE[t.kind]}`}>
              {ICON[t.kind]}
            </span>
            <p className="text-sm font-medium">{t.text}</p>
          </div>
        ))}
      </div>

      <dialog ref={ref} className="modal" onCancel={(e) => { e.preventDefault(); close(false); }}>
        {dialog && (
          <div className="card w-[26rem] max-w-full space-y-4">
            <h2 className="text-lg font-bold">{dialog.title}</h2>
            {dialog.message && <div className="text-sm text-muted">{dialog.message}</div>}
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => close(false)} autoFocus={dialog.danger}>
                {dialog.cancelLabel ?? "Cancel"}
              </button>
              <button className={`btn ${dialog.danger ? "btn-danger" : "btn-primary"}`} onClick={() => close(true)} autoFocus={!dialog.danger}>
                {dialog.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </FeedbackContext.Provider>
  );
}
