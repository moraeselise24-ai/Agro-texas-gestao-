import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";

type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
};

type ToastContextValue = {
  showToast: (kind: ToastKind, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const iconByKind = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const toneByKind = {
  success:
    "border-emerald-500/25 bg-emerald-500/12 text-emerald-900 dark:text-emerald-100",
  error: "border-rose-500/25 bg-rose-500/12 text-rose-900 dark:text-rose-100",
  info: "border-sky-500/25 bg-sky-500/12 text-sky-900 dark:text-sky-100",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((kind: ToastKind, message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev.slice(-3), { id, kind, message: trimmed }]);
    window.setTimeout(() => dismiss(id), kind === "error" ? 5200 : 3200);
  }, [dismiss]);

  const value = useMemo<ToastContextValue>(
    () => ({
      showToast,
      success: (message) => showToast("success", message),
      error: (message) => showToast("error", message),
      info: (message) => showToast("info", message),
    }),
    [showToast]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setToasts([]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[80] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-3">
        {toasts.map((toast) => {
          const Icon = iconByKind[toast.kind];
          return (
            <div
              key={toast.id}
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-app backdrop-blur-xl",
                "animate-[toast-in_180ms_ease-out]",
                toneByKind[toast.kind]
              )}
            >
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/35 ring-1 ring-white/30 dark:bg-black/15">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 text-sm font-medium leading-5">
                {toast.message}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition hover:bg-white/30 dark:hover:bg-black/20"
                aria-label="Fechar mensagem"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de ToastProvider");
  return ctx;
};
