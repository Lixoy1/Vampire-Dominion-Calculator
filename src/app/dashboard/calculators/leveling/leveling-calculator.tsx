"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, ChevronDown, Coins, Droplets, Ghost, Hourglass } from "lucide-react";
import { levelingCost, sumLeveling, MAX_LEVEL } from "@/lib/game";
import { cn, fmt, plural } from "@/lib/utils";
import { FadeIn, Field, NumberStepper, Slider } from "@/components/ui";
import { CalcPanel, ResultTile } from "@/components/calc-ui";
import { PageHeader } from "@/components/page-header";

export function LevelingCalculator() {
  const [from, setFrom] = useState(80);
  const [to, setTo] = useState(120);
  const [incomeBlood, setIncomeBlood] = useState(120_000);
  const [incomeSouls, setIncomeSouls] = useState(2_000);
  const [incomeGold, setIncomeGold] = useState(450_000);
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => levelingCost(from, to), [from, to]);
  const totals = useMemo(() => sumLeveling(rows), [rows]);

  const days = useMemo(() => {
    const d = Math.max(
      incomeBlood > 0 ? totals.blood / incomeBlood : 0,
      incomeSouls > 0 ? totals.souls / incomeSouls : 0,
      incomeGold > 0 ? totals.gold / incomeGold : 0,
    );
    return Math.ceil(d);
  }, [totals, incomeBlood, incomeSouls, incomeGold]);

  const eta = useMemo(() => {
    const d = new Date(Date.now() + days * 86_400_000);
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(d);
  }, [days]);

  const visible = showAll ? rows : rows.slice(0, 12);

  // Кривая нарастающих затрат крови
  const chart = useMemo(() => {
    if (rows.length < 2) return null;
    let cum = 0;
    const pts = rows.map((r) => {
      cum += r.blood;
      return cum;
    });
    const max = pts[pts.length - 1];
    const W = 560;
    const H = 120;
    const path = pts
      .map((p, i) => {
        const x = (i / (pts.length - 1)) * W;
        const y = H - (p / max) * (H - 8);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return { line: path, area: `${path} L${W},${H} L0,${H} Z`, W, H };
  }, [rows]);

  const setLevels = (a: number, b: number) => {
    setFrom(Math.min(a, b));
    setTo(Math.max(a, b));
  };

  return (
    <div>
      <PageHeader
        title="Калькулятор прокачки"
        subtitle="Стоимость каждого уровня в крови, душах и золоте — плюс сроки фарма при вашем ежедневном доходе."
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <FadeIn className="lg:col-span-3">
          <CalcPanel title="Диапазон уровней">
            <div className="flex flex-col gap-6">
              <Field label="Текущий уровень" hint={`1–${MAX_LEVEL - 1}`}>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-lg font-bold text-bone">{from}</span>
                    <NumberStepper className="w-32" value={from} min={1} max={MAX_LEVEL - 1} onChange={(v) => setLevels(v, to)} />
                  </div>
                  <Slider value={from} min={1} max={MAX_LEVEL - 1} onChange={(v) => setLevels(v, to)} />
                </div>
              </Field>
              <Field label="Целевой уровень" hint={`до ${MAX_LEVEL}`}>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-lg font-bold text-blood-2">{to}</span>
                    <NumberStepper className="w-32" value={to} min={2} max={MAX_LEVEL} onChange={(v) => setLevels(from, v)} />
                  </div>
                  <Slider value={to} min={2} max={MAX_LEVEL} onChange={(v) => setLevels(from, v)} />
                </div>
              </Field>

              <div className="flex flex-wrap gap-1.5">
                {[
                  [1, 60],
                  [60, 100],
                  [100, 150],
                  [150, 200],
                ].map(([a, b]) => (
                  <button
                    key={a}
                    onClick={() => setLevels(a, b)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                      from === a && to === b ? "border-blood/50 bg-blood/15 text-blood-2" : "border-line text-ash hover:text-bone",
                    )}
                  >
                    {a} → {b}
                  </button>
                ))}
              </div>

              <div className="border-t border-line/60 pt-5">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ash">Ваш доход в день</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Кровь">
                    <NumberStepper value={incomeBlood} min={0} max={100_000_000} step={10000} onChange={setIncomeBlood} />
                  </Field>
                  <Field label="Души">
                    <NumberStepper value={incomeSouls} min={0} max={10_000_000} step={250} onChange={setIncomeSouls} />
                  </Field>
                  <Field label="Золото">
                    <NumberStepper value={incomeGold} min={0} max={100_000_000} step={25000} onChange={setIncomeGold} />
                  </Field>
                </div>
              </div>

              {chart && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-smoke">
                    Накопленная стоимость в крови
                  </p>
                  <svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="w-full">
                    <defs>
                      <linearGradient id="bloodArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#e0344a" stopOpacity="0.45" />
                        <stop offset="100%" stopColor="#e0344a" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>
                    <motion.path d={chart.area} fill="url(#bloodArea)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
                    <motion.path
                      key={chart.line}
                      d={chart.line}
                      fill="none"
                      stroke="#e0344a"
                      strokeWidth="2"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1, ease: "easeOut" }}
                    />
                  </svg>
                </div>
              )}
            </div>
          </CalcPanel>
        </FadeIn>

        <FadeIn delay={0.1} className="lg:col-span-2">
          <div className="flex flex-col gap-3 lg:sticky lg:top-10">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <ResultTile
                icon={<Droplets size={14} />}
                label="Кровь"
                value={totals.blood}
                color="#e0344a"
                sub={incomeBlood > 0 ? `≈ ${fmt(Math.ceil(totals.blood / incomeBlood))} дн. фарма` : undefined}
              />
              <ResultTile
                icon={<Ghost size={14} />}
                label="Души"
                value={totals.souls}
                color="#8b5cf6"
                sub={incomeSouls > 0 ? `≈ ${fmt(Math.ceil(totals.souls / incomeSouls))} дн. фарма` : undefined}
              />
              <ResultTile
                icon={<Coins size={14} />}
                label="Золото"
                value={totals.gold}
                color="#d9a441"
                sub={incomeGold > 0 ? `≈ ${fmt(Math.ceil(totals.gold / incomeGold))} дн. фарма` : undefined}
              />
            </div>
            <div className="rounded-xl border border-blood/30 bg-blood/[0.07] p-5">
              <div className="flex items-center gap-2 text-blood-2">
                <Hourglass size={16} />
                <p className="text-[11px] font-bold uppercase tracking-[0.16em]">Итоговый срок</p>
              </div>
              <p className="font-display mt-2 text-3xl font-bold text-bone">
                {fmt(days)} {plural(days, "день", "дня", "дней")}
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ash">
                <CalendarDays size={12} className="text-smoke" /> готовность к {eta}
              </p>
              <p className="mt-1 text-[11px] text-smoke">{rows.length} переходов уровня · от {from} до {to}</p>
            </div>
          </div>
        </FadeIn>
      </div>

      {/* Таблица уровней */}
      <FadeIn delay={0.16} className="mt-4">
        <CalcPanel title="Поуровневая раскладка" description="Стоимость перехода с уровня N на N+1">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-[0.16em] text-smoke">
                  <th className="pb-2.5 pr-4">Переход</th>
                  <th className="pb-2.5 pr-4 text-right">Кровь</th>
                  <th className="pb-2.5 pr-4 text-right">Души</th>
                  <th className="pb-2.5 text-right">Золото</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.level} className="border-b border-line/40 transition-colors hover:bg-white/[0.02]">
                    <td className="py-2 pr-4 font-medium text-bone">
                      {r.level} <span className="text-smoke">→</span> {r.level + 1}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-ash">{fmt(r.blood)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-ash">{fmt(r.souls)}</td>
                    <td className="py-2 text-right tabular-nums text-ash">{fmt(r.gold)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 12 && (
            <button
              onClick={() => setShowAll((s) => !s)}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-ash transition-colors hover:border-blood/40 hover:text-bone cursor-pointer"
            >
              {showAll ? "Свернуть" : `Показать все ${rows.length} уровней`}
              <ChevronDown size={14} className={cn("transition-transform", showAll && "rotate-180")} />
            </button>
          )}
        </CalcPanel>
      </FadeIn>
    </div>
  );
}
