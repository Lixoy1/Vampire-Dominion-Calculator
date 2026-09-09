"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Card, ProgressBar } from "@/components/ui";
import { cn, fmt } from "@/lib/utils";

export function CalculatorShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-bold uppercase tracking-[0.06em] text-bone sm:text-2xl">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ash">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

export function ResultCard({
  title,
  value,
  accent = "blood",
  detail,
}: {
  title: string;
  value: number;
  accent?: "blood" | "gold" | "cyan" | "green";
  detail?: string;
}) {
  const classes = {
    blood: "text-blood-2 border-blood/30 bg-blood/5",
    gold: "text-gold border-gold/30 bg-gold/5",
    cyan: "text-cyan-300 border-cyan-400/30 bg-cyan-400/5",
    green: "text-green-300 border-green-400/30 bg-green-400/5",
  } as const;
  return (
    <Card className={cn("p-5", classes[accent])}>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ash">{title}</p>
      <p className="mt-2 font-display text-2xl font-bold tabular-nums sm:text-3xl">{fmt(value)}</p>
      {detail && <p className="mt-1 text-xs text-smoke">{detail}</p>}
    </Card>
  );
}

export function ComparisonBar({
  label,
  current,
  target,
  suffix = "",
}: {
  label: string;
  current: number;
  target: number;
  suffix?: string;
}) {
  const pct = target > 0 ? (current / target) * 100 : 0;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-semibold text-ash">{label}</span>
        <span className="tabular-nums text-bone">
          {fmt(current)}{suffix} / {fmt(target)}{suffix}
        </span>
      </div>
      <ProgressBar value={pct} />
    </div>
  );
}

export function StatTile({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <motion.div whileHover={{ y: -2 }} className="rounded-xl border border-line bg-abyss/50 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-smoke">{label}</p>
      <div className="mt-1.5 font-display text-lg font-semibold text-bone">{value}</div>
      {note && <p className="mt-1 text-[11px] text-smoke">{note}</p>}
    </motion.div>
  );
}
