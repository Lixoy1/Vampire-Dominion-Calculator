"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastCtx = createContext<{ push: (kind: ToastKind, message: string) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const icons: Record<ToastKind, ReactNode> = {
  success: <Check size={15} />,
  error: <X size={15} />,
  info: <Info size={15} />,
};

const colors: Record<ToastKind, string> = {
  success: "#4ade80",
  error: "#ff5a6e",
  info: "#22d3ee",
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
              className="pointer-events-auto flex items-center gap-3 rounded-xl border border-line bg-crypt-2/95 px-4 py-3 shadow-[0_16px_50px_rgba(0,0,0,0.6)] backdrop-blur"
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={{ color: colors[t.kind], backgroundColor: `${colors[t.kind]}1f` }}
              >
                {icons[t.kind]}
              </span>
              <p className="text-sm font-medium text-bone">{t.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
