import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import {
  ArrowRight,
  Droplets,
  Gem,
  Ghost,
  Plus,
  Sparkles,
  Swords,
  Target,
  TrendingUp,
} from "lucide-react";
import { db } from "@/db";
import { artifacts, goals, heroes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { abbrNumber, computePower, heroClassMeta, powerRank, resourceMeta } from "@/lib/game";
import { RESOURCE_ICONS } from "@/lib/icons";
import { daysUntil, fmt, fmtDate } from "@/lib/utils";
import { Button, Card, EmptyState, FadeIn, ProgressBar } from "@/components/ui";
import { ClassDonut, PowerBarChart, StatCards, type StatItem } from "./overview-widgets";

export const metadata: Metadata = { title: "Обзор" };

export default async function DashboardPage() {
  const user = await requireUser();

  const [heroRows, artifactRows, goalRows] = await Promise.all([
    db.select().from(heroes).where(eq(heroes.userId, user.id)).orderBy(desc(heroes.updatedAt)),
    db.select().from(artifacts).where(eq(artifacts.userId, user.id)).orderBy(desc(artifacts.createdAt)),
    db.select().from(goals).where(eq(goals.userId, user.id)).orderBy(desc(goals.updatedAt)),
  ]);

  const withPower = heroRows
    .map((h) => ({ ...h, power: computePower(h).total, meta: heroClassMeta(h.heroClass) }))
    .sort((a, b) => b.power - a.power);

  const totalPower = withPower.reduce((s, h) => s + h.power, 0);
  const eliteArtifacts = artifactRows.filter((a) => a.rarity === "legendary" || a.rarity === "mythic").length;
  const doneGoals = goalRows.filter((g) => g.currentAmount >= g.targetAmount).length;

  const stats: StatItem[] = [
    {
      key: "flame",
      label: "Суммарная мощь",
      value: totalPower,
      sub: powerRank(totalPower),
      color: "#e0344a",
      href: "/dashboard/calculators/power",
    },
    {
      key: "users",
      label: "Героев в ковене",
      value: heroRows.length,
      sub: withPower.length ? `Сильнейший — ${withPower[0].name}` : "Пока пусто",
      color: "#8b5cf6",
      href: "/dashboard/heroes",
    },
    {
      key: "gem",
      label: "Артефактов",
      value: artifactRows.length,
      sub: `${eliteArtifacts} элитных (лег./миф.)`,
      color: "#22d3ee",
      href: "/dashboard/artifacts",
    },
    {
      key: "target",
      label: "Целей выполнено",
      value: doneGoals,
      sub: `из ${goalRows.length} активных планов`,
      color: "#d9a441",
      href: "/dashboard/goals",
    },
  ];

  const classDist = Object.values(
    withPower.reduce<Record<string, { label: string; count: number; color: string }>>((acc, h) => {
      acc[h.heroClass] ??= { label: h.meta.label, count: 0, color: h.meta.color };
      acc[h.heroClass].count += 1;
      return acc;
    }, {}),
  );

  const chronicle = [
    ...heroRows.map((h) => ({
      id: `h-${h.id}`,
      at: h.updatedAt,
      icon: <Swords size={14} />,
      color: heroClassMeta(h.heroClass).color,
      text: `Герой «${h.name}» обновлён`,
      sub: `${heroClassMeta(h.heroClass).label} · ${h.level} ур.`,
    })),
    ...artifactRows.map((a) => ({
      id: `a-${a.id}`,
      at: a.createdAt,
      icon: <Gem size={14} />,
      color: "#22d3ee",
      text: `Получен артефакт «${a.name}»`,
      sub: "Добавлен в инвентарь",
    })),
    ...goalRows.map((g) => ({
      id: `g-${g.id}`,
      at: g.updatedAt,
      icon: g.currentAmount >= g.targetAmount ? <Sparkles size={14} /> : <Target size={14} />,
      color: g.currentAmount >= g.targetAmount ? "#4ade80" : "#d9a441",
      text:
        g.currentAmount >= g.targetAmount
          ? `Цель «${g.title}» достигнута`
          : `Прогресс цели «${g.title}»`,
      sub: `${fmt(g.currentAmount)} / ${fmt(g.targetAmount)} ${resourceMeta(g.resource).unit}`,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 7);

  const activeGoals = goalRows.filter((g) => g.currentAmount < g.targetAmount).slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      <FadeIn>
        <Card className="relative overflow-hidden">
          <div className="absolute inset-y-0 right-0 hidden w-[46%] sm:block">
            <Image
              src="/images/banner.jpg"
              alt=""
              fill
              priority
              className="object-cover opacity-70"
              style={{ maskImage: "linear-gradient(to left, black 30%, transparent)", WebkitMaskImage: "linear-gradient(to left, black 30%, transparent)" }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-crypt via-transparent to-transparent" />
          </div>
          <div className="relative p-6 sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-blood-2">{fmtDate(new Date())}</p>
            <h1 className="font-display mt-2 max-w-lg text-2xl font-bold leading-tight text-bone sm:text-3xl">
              Ночь вступила в права, {user.name}
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-ash">
              Ваш ковен набирает <span className="font-semibold text-blood-2">{abbrNumber(totalPower)}</span> мощи.
              Титул клана: <span className="font-semibold text-gold">{powerRank(totalPower)}</span>. Рассчитайте
              следующий шаг развития.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/dashboard/heroes"><Button><Plus size={15} /> Новый герой</Button></Link>
              <Link href="/dashboard/calculators/power"><Button variant="secondary"><TrendingUp size={15} /> Калькулятор силы</Button></Link>
            </div>
          </div>
        </Card>
      </FadeIn>

      <StatCards stats={stats} />

      {heroRows.length === 0 ? (
        <EmptyState
          icon={<Ghost size={28} />}
          title="Ковен пока пуст"
          description="Добавьте первого героя, чтобы следить за его силой, артефактами и планами прокачки."
          action={<Link href="/dashboard/heroes"><Button><Plus size={15} /> Призвать героя</Button></Link>}
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-5">
            <FadeIn delay={0.1} className="lg:col-span-3">
              <Card className="h-full p-5 sm:p-6">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-bone">Мощь героев</h2>
                  <Link href="/dashboard/heroes" className="flex items-center gap-1 text-xs font-semibold text-blood-2 hover:text-bone transition-colors">Все герои <ArrowRight size={12} /></Link>
                </div>
                <PowerBarChart data={withPower.slice(0, 6).map((h) => ({ name: h.name, power: h.power, color: h.meta.color, favorite: h.favorite }))} />
              </Card>
            </FadeIn>
            <FadeIn delay={0.18} className="lg:col-span-2">
              <Card className="h-full p-5 sm:p-6">
                <h2 className="font-display mb-6 text-xs font-semibold uppercase tracking-[0.16em] text-bone">Классы ковена</h2>
                <ClassDonut data={classDist} total={heroRows.length} />
              </Card>
            </FadeIn>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <FadeIn delay={0.24}>
              <Card className="h-full p-5 sm:p-6">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-bone">Ближайшие цели</h2>
                  <Link href="/dashboard/goals" className="flex items-center gap-1 text-xs font-semibold text-blood-2 hover:text-bone transition-colors">Все цели <ArrowRight size={12} /></Link>
                </div>
                {activeGoals.length === 0 ? (
                  <p className="text-sm text-smoke">Все цели выполнены. Клан доволен вами.</p>
                ) : (
                  <div className="flex flex-col gap-5">
                    {activeGoals.map((g) => {
                      const meta = resourceMeta(g.resource);
                      const Icon = RESOURCE_ICONS[g.resource];
                      const pct = (g.currentAmount / g.targetAmount) * 100;
                      const left = daysUntil(g.deadline);
                      return (
                        <div key={g.id}>
                          <div className="mb-1.5 flex items-center gap-2">
                            <Icon size={13} style={{ color: meta.color }} />
                            <p className="min-w-0 flex-1 truncate text-sm font-medium text-bone">{g.title}</p>
                            {left !== null && <span className="shrink-0 text-[11px] text-smoke">{left > 0 ? `${left} дн.` : "срок вышел"}</span>}
                          </div>
                          <ProgressBar value={pct} color={meta.color} />
                          <p className="mt-1 text-[11px] tabular-nums text-smoke">{fmt(g.currentAmount)} из {fmt(g.targetAmount)} {meta.unit} · {Math.round(pct)}%</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </FadeIn>

            <FadeIn delay={0.3}>
              <Card className="h-full p-5 sm:p-6">
                <h2 className="font-display mb-5 text-xs font-semibold uppercase tracking-[0.16em] text-bone">Хроника клана</h2>
                <ol className="relative flex flex-col gap-1 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-line">
                  {chronicle.map((c) => (
                    <li key={c.id} className="relative flex gap-3.5 rounded-lg px-1 py-2 transition-colors hover:bg-white/[0.03]">
                      <span className="relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-crypt-2" style={{ color: c.color }}>{c.icon}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-bone">{c.text}</p>
                        <p className="text-[11px] text-smoke">{c.sub} · {fmtDate(c.at)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            </FadeIn>
          </div>

          <FadeIn delay={0.36}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Link href="/dashboard/calculators/leveling" className="group">
                <Card className="flex h-full items-center gap-4 p-5 transition-all group-hover:-translate-y-0.5 group-hover:border-[#3a2e50] duration-300">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blood/15 text-blood-2"><Droplets size={22} /></span>
                  <div className="flex-1"><p className="font-display text-sm font-semibold text-bone">Сколько крови на 200 уровень?</p><p className="mt-0.5 text-xs text-smoke">Калькулятор прокачки посчитает ресурсы и сроки</p></div>
                  <ArrowRight size={16} className="text-smoke transition-transform group-hover:translate-x-1" />
                </Card>
              </Link>
              <Link href="/dashboard/calculators/savings" className="group">
                <Card className="flex h-full items-center gap-4 p-5 transition-all group-hover:-translate-y-0.5 group-hover:border-[#3a2e50] duration-300">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold/15 text-gold"><Target size={22} /></span>
                  <div className="flex-1"><p className="font-display text-sm font-semibold text-bone">Когда накопится на цель?</p><p className="mt-0.5 text-xs text-smoke">Планировщик накоплений с датой достижения</p></div>
                  <ArrowRight size={16} className="text-smoke transition-transform group-hover:translate-x-1" />
                </Card>
              </Link>
            </div>
          </FadeIn>
        </>
      )}
    </div>
  );
}
