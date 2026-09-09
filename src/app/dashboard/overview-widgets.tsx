"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Flame, Gem, Star, Target, Users } from "lucide-react";
import { AnimatedNumber, Card } from "@/components/ui";

const STAT_ICONS = { flame: Flame, users: Users, gem: Gem, target: Target } as const;

export interface StatItem {
  key: keyof typeof STAT_ICONS;
  label: string;
  value: number;
  sub: string;
  color: string;
  href: string;
}

export function StatCards({ stats }: { stats: StatItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {stats.map((s, i) => {
        const Icon = STAT_ICONS[s.key];
        return (
          <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
            <Link href={s.href} className="group block">
              <Card className="relative overflow-hidden p-4 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[#3a2e50] sm:p-5">
                <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-15 blur-2xl transition-opacity group-hover:opacity-30" style={{ backgroundColor: s.color }} />
                <div className="flex items-start justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ color: s.color, backgroundColor: `${s.color}1a` }}><Icon size={17} /></span>
                  <ArrowUpRight size={14} className="text-smoke opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="mt-3 font-display text-xl font-bold text-bone sm:text-2xl"><AnimatedNumber value={s.value} /></p>
                <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ash">{s.label}</p>
                <p className="mt-1 truncate text-xs text-smoke">{s.sub}</p>
              </Card>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}

export interface PowerBarDatum {
  name: string;
  power: number;
  color: string;
  favorite: boolean;
}

export function PowerBarChart({ data }: { data: PowerBarDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.power));
  return (
    <div className="flex flex-col gap-4">
      {data.map((d, i) => (
        <div key={d.name}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-bone">
              {d.favorite && <Star size={11} className="shrink-0 text-gold" fill="currentColor" />}
              <span className="truncate">{d.name}</span>
            </p>
            <p className="shrink-0 text-xs tabular-nums text-ash"><AnimatedNumber value={d.power} /></p>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#241b33]">
            <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${d.color}55, ${d.color})`, boxShadow: `0 0 14px ${d.color}55` }} initial={{ width: 0 }} animate={{ width: `${(d.power / max) * 100}%` }} transition={{ duration: 1, delay: 0.15 + i * 0.08, ease: [0.22, 1, 0.36, 1] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface DonutDatum { label: string; count: number; color: string; }

export function ClassDonut({ data, total }: { data: DonutDatum[]; total: number }) {
  const R = 56;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const segments = data.map((d) => {
    const frac = total > 0 ? d.count / total : 0;
    const seg = { ...d, dash: frac * C, offset: offset * C };
    offset += frac;
    return seg;
  });

  return (
    <div className="flex items-center gap-6">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#241b33" strokeWidth="14" />
          {segments.map((s, i) => (
            <motion.circle key={s.label} cx="70" cy="70" r={R} fill="none" stroke={s.color} strokeWidth="14" strokeLinecap="butt" strokeDasharray={`${Math.max(0, s.dash - 2)} ${C - s.dash + 2}`} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: -s.offset }} transition={{ duration: 1, delay: 0.2 + i * 0.1, ease: [0.22, 1, 0.36, 1] }} />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <AnimatedNumber value={total} className="font-display text-2xl font-bold text-bone" />
          <span className="text-[10px] uppercase tracking-[0.18em] text-smoke">героев</span>
        </div>
      </div>
      <ul className="flex flex-col gap-2.5">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color, boxShadow: `0 0 8px ${s.color}88` }} />
            <span className="text-ash">{s.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-bone">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
