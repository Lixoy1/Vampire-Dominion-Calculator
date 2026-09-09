"use client";

import { ReactNode } from "react";
import { Star } from "lucide-react";
import { AnimatedNumber, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

export function ResultTile({
  icon,
  label,
  value,
  sub,
  color,
  big,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  sub?: string;
  color: string;
  big?: boolean;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border p-4"
      style={{ borderColor: `${color}2e`, backgroundColor: `${color}0a` }}
    >
      <div className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-20 blur-xl" style={{ backgroundColor: color }} />
      <div className="flex items-center gap-2" style={{ color }}>
        {icon}
        <p className="text-[10px] font-bold uppercase tracking-[0.16em]">{label}</p>
      </div>
      <p className={cn("mt-2 font-display font-bold text-bone", big ? "text-2xl sm:text-3xl" : "text-xl")}>
        <AnimatedNumber value={value} />
      </p>
      {sub && <p className="mt-1 text-[11px] text-smoke">{sub}</p>}
    </div>
  );
}

export function StarsPicker({
  label,
  value,
  onChange,
  max = 10,
  accent = "#d9a441",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
  accent?: string;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ash">{label}</p>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: max }).map((_, i) => {
          const n = i + 1;
          const active = n <= value;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg border transition-all hover:scale-110 cursor-pointer",
                active ? "border-transparent" : "border-line text-[#3a3049] hover:text-smoke",
              )}
              style={active ? { color: accent, backgroundColor: `${accent}1f` } : undefined}
              title={`${n}★`}
            >
              <Star size={14} fill={active ? "currentColor" : "none"} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CalcPanel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-5 sm:p-6", className)}>
      <h2 className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-bone">{title}</h2>
      {description && <p className="mt-1 text-xs leading-relaxed text-smoke">{description}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  );
}
