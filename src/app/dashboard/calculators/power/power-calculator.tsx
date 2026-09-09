"use client";

import { useMemo, useState } from "react";
import { HeartPulse, Shield, Swords, Wind } from "lucide-react";
import type { Hero } from "@/db/schema";
import { computePower, heroClassMeta, HERO_CLASSES, MAX_LEVEL, MAX_STARS, powerRank, type HeroClassId, type HeroStats } from "@/lib/game";
import { cn, fmt } from "@/lib/utils";
import { CalcPanel } from "@/components/calc-ui";
import { Button, FadeIn, Field, NumberStepper, Select, Slider } from "@/components/ui";
import { PageHeader } from "@/components/page-header";

const rows = [
  { key: "attack" as const, label: "Атака", icon: Swords, color: "#e0344a", max: 200000 },
  { key: "hp" as const, label: "Здоровье", icon: HeartPulse, color: "#4ade80", max: 2500000 },
  { key: "defense" as const, label: "Защита", icon: Shield, color: "#38bdf8", max: 150000 },
  { key: "speed" as const, label: "Скорость", icon: Wind, color: "#d9a441", max: 20000 },
];

export function PowerCalculator({ heroes, initialHeroId }: { heroes: Hero[]; initialHeroId: string | null }) {
  const selected = heroes.find((h) => h.id === initialHeroId) ?? null;
  const [stats, setStats] = useState<HeroStats>(selected ? {
    heroClass: selected.heroClass,
    level: selected.level,
    stars: selected.stars,
    attack: selected.attack,
    hp: selected.hp,
    defense: selected.defense,
    speed: selected.speed,
  } : { heroClass: "blood_warrior", level: 60, stars: 4, attack: 520, hp: 6200, defense: 340, speed: 105 });
  const set = <K extends keyof HeroStats>(key: K, value: HeroStats[K]) => setStats((s) => ({ ...s, [key]: value }));
  const result = useMemo(() => computePower(stats), [stats]);
  const meta = heroClassMeta(stats.heroClass);

  return <div>
    <PageHeader title="Сила героя" subtitle="Рассчитайте боевую мощь героя по текущим характеристикам." />
    <div className="grid gap-4 lg:grid-cols-5">
      <FadeIn className="lg:col-span-3"><CalcPanel title="Параметры" description="Задайте характеристики героя">
        <div className="flex flex-col gap-5">
          {heroes.length > 0 && <Field label="Герой из ковена"><Select value={selected?.id ?? ""} onChange={(e) => { const h = heroes.find((x) => x.id === e.target.value); if (h) setStats({ heroClass: h.heroClass, level: h.level, stars: h.stars, attack: h.attack, hp: h.hp, defense: h.defense, speed: h.speed }); }}><option value="">Не выбран</option>{heroes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select></Field>}
          <Field label="Класс героя"><div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{HERO_CLASSES.map((c) => <button key={c.id} type="button" onClick={() => set("heroClass", c.id as HeroClassId)} className={cn("rounded-xl border px-2 py-2 text-[10px] font-bold", stats.heroClass === c.id ? "text-white" : "border-line text-smoke")} style={stats.heroClass === c.id ? { borderColor: `${c.color}88`, backgroundColor: `${c.color}22`, color: c.color } : undefined}>{c.label}</button>)}</div></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Уровень"><NumberStepper value={stats.level} min={1} max={MAX_LEVEL} onChange={(v) => set("level", v)} /><Slider value={stats.level} min={1} max={MAX_LEVEL} onChange={(v) => set("level", v)} /></Field><Field label="Звёзды"><NumberStepper value={stats.stars} min={1} max={MAX_STARS} onChange={(v) => set("stars", v)} /><Slider value={stats.stars} min={1} max={MAX_STARS} onChange={(v) => set("stars", v)} /></Field></div>
          <div className="grid gap-4 sm:grid-cols-2">{rows.map((r) => <Field key={r.key} label={r.label}><NumberStepper value={stats[r.key]} min={0} max={r.max} step={r.key === "hp" ? 100 : 1} onChange={(v) => set(r.key, v)} /></Field>)}</div>
        </div>
      </CalcPanel></FadeIn>
      <FadeIn delay={0.1} className="lg:col-span-2"><CalcPanel title="Результат"><div className="rounded-xl border p-5" style={{ borderColor: `${meta.color}55` }}><p className="text-xs uppercase tracking-wider text-smoke">Боевая мощь</p><p className="mt-2 font-display text-5xl font-bold text-bone">{fmt(result.total)}</p><p className="mt-2 text-sm" style={{ color: meta.color }}>{powerRank(result.total)}</p><div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs"><div><div className="text-smoke">Уровень</div><b>{result.levelMult.toFixed(2)}×</b></div><div><div className="text-smoke">Звёзды</div><b>{result.starMult.toFixed(2)}×</b></div><div><div className="text-smoke">Класс</div><b>{result.classMult.toFixed(2)}×</b></div></div></div></CalcPanel></FadeIn>
    </div>
  </div>;
}
