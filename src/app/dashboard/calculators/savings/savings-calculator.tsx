"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Hourglass, TrendingUp } from "lucide-react";
import { RESOURCES, resourceMeta, type ResourceId } from "@/lib/game";
import { cn, fmt, plural } from "@/lib/utils";
import { CalcPanel, ResultTile } from "@/components/calc-ui";
import { FadeIn, Field, NumberStepper } from "@/components/ui";
import { PageHeader } from "@/components/page-header";

export function SavingsCalculator() {
  const [resource, setResource] = useState<ResourceId>("blood");
  const [target, setTarget] = useState(5_000_000);
  const [current, setCurrent] = useState(1_200_000);
  const [income, setIncome] = useState(120_000);
  const meta = resourceMeta(resource);
  const remaining = Math.max(0, target - current);
  const days = income > 0 ? Math.ceil(remaining / income) : remaining > 0 ? Infinity : 0;
  const pct = Math.min(100, target > 0 ? (current / target) * 100 : 0);
  const eta = useMemo(() => Number.isFinite(days) ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(Date.now() + days * 86400000)) : "Укажите доход в день", [days]);
  return <div>
    <PageHeader title="Калькулятор накоплений" subtitle="Рассчитайте остаток ресурса и срок достижения цели." />
    <div className="grid gap-4 lg:grid-cols-5">
      <FadeIn className="lg:col-span-3"><CalcPanel title="Параметры накопления"><div className="flex flex-col gap-5">
        <Field label="Ресурс"><div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{RESOURCES.map((r) => <button key={r.id} type="button" onClick={() => { setResource(r.id); setTarget(r.id === "blood" ? 5000000 : r.id === "souls" ? 50000 : r.id === "gold" ? 2000000 : r.id === "essence" ? 1500 : 400); }} className={cn("rounded-xl border px-2 py-2 text-[11px] font-bold", resource === r.id ? "text-white" : "border-line text-smoke")} style={resource === r.id ? { borderColor: `${r.color}88`, color: r.color } : undefined}>{r.label}</button>)}</div></Field>
        <div className="grid gap-4 sm:grid-cols-3"><Field label={`Цель, ${meta.unit}`}><NumberStepper value={target} min={1} max={999999999} onChange={setTarget} /></Field><Field label="Уже есть"><NumberStepper value={current} min={0} max={target} onChange={(v) => setCurrent(Math.min(v, target))} /></Field><Field label="Доход в день"><NumberStepper value={income} min={0} max={999999999} onChange={setIncome} /></Field></div>
        <div><div className="mb-2 flex justify-between text-xs text-smoke"><span>Прогресс</span><span>{pct.toFixed(1)}%</span></div><div className="h-3 overflow-hidden rounded-full bg-[#241b33]"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta.color }} /></div></div>
      </div></CalcPanel></FadeIn>
      <FadeIn delay={0.1} className="lg:col-span-2"><div className="flex flex-col gap-3"><ResultTile icon={<TrendingUp size={14} />} label={`Осталось собрать, ${meta.unit}`} value={remaining} color={meta.color} big /><div className="rounded-xl border border-line bg-crypt-2/50 p-5"><div className="flex items-center gap-2 text-blood-2"><Hourglass size={15} /><p className="text-[11px] font-bold uppercase tracking-[0.16em]">Срок до цели</p></div><p className="mt-2 font-display text-3xl font-bold text-bone">{Number.isFinite(days) ? `${fmt(days)} ${plural(days, "день", "дня", "дней")}` : "∞"}</p><p className="mt-1.5 flex items-center gap-1.5 text-xs text-ash"><CalendarDays size={12} className="text-smoke" />{eta}</p></div></div></FadeIn>
    </div>
  </div>;
}
