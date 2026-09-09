import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Crown, Hourglass, Swords, TrendingUp } from "lucide-react";
import { Card, FadeIn } from "@/components/ui";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Калькуляторы" };

const CALCS = [
  {
    href: "/dashboard/calculators/power",
    icon: Swords,
    color: "#e0344a",
    title: "Сила героя",
    desc: "Точный расчёт боевой мощи по характеристикам, уровню и звёздам. Разбор вклада каждого стата.",
    tag: "Популярный",
  },
  {
    href: "/dashboard/calculators/leveling",
    icon: TrendingUp,
    color: "#8b5cf6",
    title: "Прокачка",
    desc: "Сколько крови, душ и золота уйдёт на диапазон уровней, и сколько дней это займёт при вашем доходе.",
    tag: "С таблицей",
  },
  {
    href: "/dashboard/calculators/awakening",
    icon: Crown,
    color: "#d9a441",
    title: "Пробуждение",
    desc: "Стоимость перехода по звёздам: тёмная эссенция, осколки душ и дубликаты героев.",
    tag: "До 10★",
  },
  {
    href: "/dashboard/calculators/savings",
    icon: Hourglass,
    color: "#22d3ee",
    title: "Накопления",
    desc: "Когда накопится нужная сумма ресурса при вашем темпе фарма — с датой и кнопкой создания цели.",
    tag: "Планировщик",
  },
];

export default function CalculatorsPage() {
  return (
    <div>
      <PageHeader
        title="Калькуляторы"
        subtitle="Инструменты точного расчёта для «Наследия Вампиров». Все формулы собраны по данным сезона III."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {CALCS.map((c, i) => (
          <FadeIn key={c.href} delay={0.08 * i}>
            <Link href={c.href} className="group block h-full">
              <Card className="relative h-full overflow-hidden p-6 transition-all duration-300 group-hover:-translate-y-1 group-hover:border-[#3a2e50]">
                <div
                  className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full opacity-10 blur-3xl transition-opacity group-hover:opacity-25"
                  style={{ backgroundColor: c.color }}
                />
                <div className="flex items-start justify-between">
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110"
                    style={{ color: c.color, backgroundColor: `${c.color}1a`, boxShadow: `inset 0 0 0 1px ${c.color}33` }}
                  >
                    <c.icon size={22} />
                  </span>
                  <span
                    className="rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]"
                    style={{ color: c.color, borderColor: `${c.color}44`, backgroundColor: `${c.color}12` }}
                  >
                    {c.tag}
                  </span>
                </div>
                <h2 className="font-display mt-4 text-base font-semibold text-bone">{c.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ash">{c.desc}</p>
                <p className="mt-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-smoke transition-colors group-hover:text-bone">
                  Открыть <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
                </p>
              </Card>
            </Link>
          </FadeIn>
        ))}
      </div>
    </div>
  );
}
