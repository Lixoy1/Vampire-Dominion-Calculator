"use client";

import {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  useEffect,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Кнопки ───────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gold";

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}) {
  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-gradient-to-b from-blood-2 to-blood text-white shadow-[0_8px_24px_rgba(224,52,74,0.35),inset_0_1px_0_rgba(255,255,255,0.25)] hover:shadow-[0_8px_32px_rgba(224,52,74,0.5)] hover:brightness-110 border border-blood-2/40",
    secondary:
      "bg-crypt-2 text-bone border border-line hover:border-blood/50 hover:bg-[#221733]",
    ghost: "text-ash hover:text-bone hover:bg-white/5 border border-transparent",
    danger:
      "bg-transparent text-blood-2 border border-blood/40 hover:bg-blood/10 hover:border-blood",
    gold: "bg-gradient-to-b from-[#f0c060] to-gold text-[#241703] shadow-[0_8px_24px_rgba(217,164,65,0.3)] hover:brightness-110 border border-gold/60",
  };
  const sizes = {
    sm: "h-8 px-3 text-xs gap-1.5",
    md: "h-10 px-4 text-sm gap-2",
    lg: "h-12 px-6 text-base gap-2",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-semibold tracking-wide transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}

// ─── Кнопка-подтверждение (двойной клик) ──────────────────────────────────────

export function ConfirmButton({
  onConfirm,
  className,
  children,
  confirmChildren,
  variant = "danger",
  size = "sm",
}: {
  onConfirm: () => void;
  className?: string;
  children: ReactNode;
  confirmChildren?: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 2600);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      type="button"
      variant={armed ? "primary" : variant}
      size={size}
      className={className}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? (confirmChildren ?? "Подтвердить?") : children}
    </Button>
  );
}

// ─── Поля ввода ───────────────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-baseline justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-ash">
        {label}
        {hint && <span className="text-[10px] font-medium normal-case tracking-normal text-smoke">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const inputBase =
  "w-full rounded-xl border border-line bg-abyss/80 px-3.5 text-sm text-bone placeholder:text-smoke outline-none transition-all focus:border-blood/60 focus:ring-4 focus:ring-blood/10";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputBase, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputBase, "py-2.5 min-h-20 resize-y", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(inputBase, "h-10 appearance-none pr-9 cursor-pointer [&>option]:bg-crypt", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-smoke" />
    </div>
  );
}

// ─── Степпер для чисел ────────────────────────────────────────────────────────

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 999_999_999,
  step = 1,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-stretch overflow-hidden rounded-xl border border-line bg-abyss/80 focus-within:border-blood/60 focus-within:ring-4 focus-within:ring-blood/10 transition-all", className)}>
      <button
        type="button"
        className="w-9 text-ash hover:text-bone hover:bg-white/5 transition-colors cursor-pointer text-lg leading-none"
        onClick={() => onChange(Math.max(min, value - step))}
      >
        −
      </button>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        onBlur={() => onChange(Math.min(max, Math.max(min, value || min)))}
        className="h-10 w-full bg-transparent text-center text-sm font-semibold text-bone outline-none"
      />
      <button
        type="button"
        className="w-9 text-ash hover:text-bone hover:bg-white/5 transition-colors cursor-pointer text-lg leading-none"
        onClick={() => onChange(Math.min(max, value + step))}
      >
        +
      </button>
    </div>
  );
}

// ─── Ползунок ─────────────────────────────────────────────────────────────────

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  className?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn("w-full", className)}
      style={{ ["--fill" as string]: `${pct}%` }}
    />
  );
}

// ─── Карточки и бейджи ────────────────────────────────────────────────────────

export function Card({
  className,
  children,
  glow,
}: {
  className?: string;
  children: ReactNode;
  glow?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-gradient-to-b from-crypt to-[#100a19] shadow-[0_12px_40px_rgba(0,0,0,0.35)]",
        glow && "shadow-[0_0_50px_rgba(224,52,74,0.12),0_12px_40px_rgba(0,0,0,0.35)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  color = "#a89eb8",
  children,
  className,
}: {
  color?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]", className)}
      style={{ color, borderColor: `${color}44`, backgroundColor: `${color}14` }}
    >
      {children}
    </span>
  );
}

// ─── Прогресс-бар ─────────────────────────────────────────────────────────────

export function ProgressBar({
  value,
  color = "#e0344a",
  className,
  height = 6,
}: {
  value: number; // 0..100
  color?: string;
  className?: string;
  height?: number;
}) {
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-[#241b33]", className)} style={{ height }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${color}cc, ${color})`, boxShadow: `0 0 12px ${color}66` }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

// ─── Модальное окно ───────────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", damping: 28, stiffness: 380 }}
            className={cn(
              "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-gradient-to-b from-crypt-2 to-crypt shadow-[0_40px_120px_rgba(0,0,0,0.7)] sm:rounded-2xl",
              wide ? "sm:max-w-2xl" : "sm:max-w-lg",
            )}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blood/60 to-transparent" />
            <div className="flex items-start justify-between gap-4 border-b border-line/60 px-5 py-4 sm:px-6">
              <div>
                <h3 className="font-display text-sm font-semibold uppercase tracking-[0.08em] text-bone">{title}</h3>
                {subtitle && <p className="mt-0.5 text-xs text-smoke">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-ash transition-colors hover:bg-white/5 hover:text-bone cursor-pointer"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Пустое состояние ─────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-line px-6 py-16 text-center"
    >
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-blood/10 blur-3xl" />
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-crypt-2 text-blood-2 shadow-[0_0_30px_rgba(224,52,74,0.15)]">
        {icon}
      </div>
      <h3 className="font-display text-sm font-semibold uppercase tracking-[0.08em] text-bone">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-smoke">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </motion.div>
  );
}

// ─── Скелетон ─────────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-white/[0.05]", className)} />;
}

// ─── Разделитель секции сайдбара ─────────────────────────────────────────────

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-2 pt-5 text-[10px] font-bold uppercase tracking-[0.22em] text-smoke first:pt-0">
      {children}
    </p>
  );
}

// ─── Анимированное число ─────────────────────────────────────────────────────

export function AnimatedNumber({
  value,
  format,
  duration = 700,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = value;
    if (from === to) return;
    const start = performance.now();
    let raf: number;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  const f = format ?? ((n: number) => new Intl.NumberFormat("ru-RU").format(Math.round(n)));
  return <span className={cn("tabular-nums", className)}>{f(display)}</span>;
}

// ─── Появление по скроллу/маунту ─────────────────────────────────────────────

export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
