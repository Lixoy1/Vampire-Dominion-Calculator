"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Copy, Crown, FlaskConical, Gem } from "lucide-react";
import { awakeningSteps, starMultiplier, sumAwakening } from "@/lib/game";
import { cn, fmt } from "@/lib/utils";
import { FadeIn } from "@/components/ui";
import { CalcPanel, ResultTile, StarsPicker } from "@/components/calc-ui";
import { PageHeader } from "@/components/page-header";

export function AwakeningCalculator() {
  const [from, setFrom] = useState(5);
  const [to, setTo] = useState(8);

  const steps = useMemo(() => awakeningSteps(from, to), [from, to]);
  const totals = useMemo(() => sumAwakening(steps), [steps]);

  const powerGain = useMemo(() => {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const gain = ((starMultiplier(hi) - starMultiplier(lo)) / starMultiplier(lo)) * 100;
    return { gain, lo, hi };
  }, [from, to]);

  // Награды для круговой диаграммы прогресса по шагам
  const cumSteps = useMemo(() => {
    let e = 0;
    return steps.map((s) => {
      e += s.essence;
      return { ...s, cumEssence: e };
    });
  }, [steps]);

  return (
    <div>
      <PageHeader
        title="Калькулятор пробуждения"
        subtitle="Стоимость роста по звёздам: тёмная эссенция, осколки душ и дубликаты героев для каждого этапа."
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <FadeIn className="lg:col-span-3">
          <CalcPanel title="Путь звёзд" description="Выберите текущее и желаемое пробуждение героя">
            <div className="flex flex-col gap-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <StarsPicker label="Сейчас" value={from} onChange={setFrom} accent="#8b5cf6" />
                <StarsPicker label="Цель" value={to} onChange={setTo} accent="#d9a441" />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  [1, 5, "Старт → 5★"],
                  [5, 7, "5★ → 7★"],
                  [7, 9, "7★ → 9★"],
                  [9, 10, "9★ → 10★"],
                ].map(([a, b, l]) => (
                  <button
                    key={String(l)}
                    onClick={() => { setFrom(Number(a)); setTo(Number(b)); }}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                      from === a && to === b ? "border-gold/50 bg-gold/15 text-gold" : "border-line text-ash hover:text-bone",
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>

              {/* Шкала пути */}
              <div>
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-smoke">Визуальный путь</p>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 10 }).map((_, i) => {
                    const n = i + 1;
                    const lo = Math.min(from, to);
                    const hi = Math.max(from, to);
                    const inPath = n > lo && n <= hi;
                    const done = n <= lo;
                    return (
                      <motion.div
                        key={n}
                        className={cn("h-8 flex-1 rounded-md border text-center text-[10px] font-bold leading-8")}
                        animate={{
                          backgroundColor: inPath ? "rgba(217,164,65,0.18)" : done ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.02)",
                          borderColor: inPath ? "rgba(217,164,65,0.45)" : done ? "rgba(139,92,246,0.35)" : "#2a2138",
                          color: inPath ? "#d9a441" : done ? "#8b5cf6" : "#6f6580",
                        }}
                      >
                        {n}
                      </motion.div>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-smoke">
                  <span>фиолетовые — уже есть</span>
                  <span>золотые — предстоят</span>
                </div>
              </div>

              <div className="rounded-xl border border-gold/30 bg-gold/[0.06] p-4">
                <div className="flex items-center gap-2 text-gold">
                  <Crown size={15} />
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em]">Прирост мощи</p>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ash">
                  Переход с {powerGain.lo}★ на {powerGain.hi}★ усилит героя на{" "}
                  <span className="font-display font-bold text-gold">+{powerGain.gain.toFixed(0)}%</span> боевой мощи
                  (множитель ×{starMultiplier(powerGain.lo).toFixed(2)} → ×{starMultiplier(powerGain.hi).toFixed(2)}).
                </p>
              </div>
            </div>
          </CalcPanel>
        </FadeIn>

        <FadeIn delay={0.1} className="lg:col-span-2">
          <div className="flex flex-col gap-3 lg:sticky lg:top-10">
            <ResultTile
              icon={<FlaskConical size={14} />}
              label="Тёмная эссенция"
              value={totals.essence}
              color="#f472b6"
              sub="Добывается из алтаря и рейдов"
              big
            />
            <ResultTile
              icon={<Gem size={14} />}
              label="Осколки душ"
              value={totals.shards}
              color="#22d3ee"
              sub="Падают с боссов подземелий"
            />
            <ResultTile
              icon={<Copy size={14} />}
              label="Дубликаты героя"
              value={totals.duplicates}
              color="#8b5cf6"
              sub="Из кровавого зеркала и событий"
            />
          </div>
        </FadeIn>
      </div>

      <FadeIn delay={0.16} className="mt-4">
        <CalcPanel title="Этапы пробуждения" description="Каждый шаг оплачивается отдельно — копите заранее">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-[0.16em] text-smoke">
                  <th className="pb-2.5 pr-4">Этап</th>
                  <th className="pb-2.5 pr-4 text-right">Эссенция</th>
                  <th className="pb-2.5 pr-4 text-right">Осколки</th>
                  <th className="pb-2.5 pr-4 text-right">Дубликаты</th>
                  <th className="pb-2.5 text-right">Эссенции накоплено</th>
                </tr>
              </thead>
              <tbody>
                {cumSteps.map((s) => (
                  <tr key={s.from} className="border-b border-line/40 transition-colors hover:bg-white/[0.02]">
                    <td className="py-2 pr-4 font-medium text-bone">
                      {s.from}★ <span className="text-smoke">→</span> {s.to}★
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-[#f472b6]">{fmt(s.essence)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-ash">{fmt(s.shards)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-ash">{s.duplicates}</td>
                    <td className="py-2 text-right tabular-nums text-smoke">{fmt(s.cumEssence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CalcPanel>
      </FadeIn>
    </div>
  );
}
