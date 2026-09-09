// ─── Игровые константы и формулы «Наследие Вампиров» ─────────────────────────

export const MAX_LEVEL = 200;
export const MAX_STARS = 10;

export type HeroClassId =
  | "blood_warrior"
  | "shadow_mage"
  | "night_assassin"
  | "necromancer"
  | "crimson_priest";

export type ResourceId = "blood" | "souls" | "gold" | "essence" | "shards";

export type ArtifactSlotId = "weapon" | "armor" | "amulet" | "ring" | "rune";
export type RarityId = "common" | "rare" | "epic" | "legendary" | "mythic";

export interface HeroClassMeta {
  id: HeroClassId;
  label: string;
  epithet: string;
  description: string;
  powerMult: number;
  color: string; // hex акцент
}

export const HERO_CLASSES: HeroClassMeta[] = [
  {
    id: "blood_warrior",
    label: "Воин крови",
    epithet: "Авангард клана",
    description: "Сбалансированный боец ближнего боя. Чем дольше живёт — тем сильнее бьёт.",
    powerMult: 1.06,
    color: "#e0344a",
  },
  {
    id: "shadow_mage",
    label: "Маг теней",
    epithet: "Глас бездны",
    description: "Испепеляет стихиями тьмы. Главная ставка — чистая атака.",
    powerMult: 1.1,
    color: "#8b5cf6",
  },
  {
    id: "night_assassin",
    label: "Ассасин ночи",
    epithet: "Тихая смерть",
    description: "Молниеносные криты и уклонение. Скорость решает всё.",
    powerMult: 1.04,
    color: "#22d3ee",
  },
  {
    id: "necromancer",
    label: "Некромант",
    epithet: "Повелитель мёртвых",
    description: "Поднимает павших врагов. Живучесть и запас здоровья.",
    powerMult: 1.0,
    color: "#4ade80",
  },
  {
    id: "crimson_priest",
    label: "Алый жрец",
    epithet: "Хранитель крови",
    description: "Исцеляет союзников жертвенной силой. Неоценим в осаде.",
    powerMult: 0.98,
    color: "#d9a441",
  },
];

export function heroClassMeta(id: HeroClassId): HeroClassMeta {
  return HERO_CLASSES.find((c) => c.id === id) ?? HERO_CLASSES[0];
}

export interface ResourceMeta {
  id: ResourceId;
  label: string;
  genitive: string; // «крови», «душ»...
  color: string;
  unit: string;
}

export const RESOURCES: ResourceMeta[] = [
  { id: "blood", label: "Кровь", genitive: "крови", color: "#e0344a", unit: "л" },
  { id: "souls", label: "Души", genitive: "душ", color: "#8b5cf6", unit: "шт" },
  { id: "gold", label: "Золото", genitive: "золота", color: "#d9a441", unit: "монет" },
  { id: "essence", label: "Тёмная эссенция", genitive: "эссенции", color: "#f472b6", unit: "фл." },
  { id: "shards", label: "Осколки душ", genitive: "осколков", color: "#22d3ee", unit: "оск." },
];

export function resourceMeta(id: ResourceId): ResourceMeta {
  return RESOURCES.find((r) => r.id === id) ?? RESOURCES[0];
}

export const ARTIFACT_SLOTS: { id: ArtifactSlotId; label: string }[] = [
  { id: "weapon", label: "Клинок" },
  { id: "armor", label: "Доспех" },
  { id: "amulet", label: "Амулет" },
  { id: "ring", label: "Кольцо" },
  { id: "rune", label: "Руна" },
];

export const RARITIES: { id: RarityId; label: string; color: string }[] = [
  { id: "common", label: "Обычный", color: "#9ca3af" },
  { id: "rare", label: "Редкий", color: "#38bdf8" },
  { id: "epic", label: "Эпический", color: "#a78bfa" },
  { id: "legendary", label: "Легендарный", color: "#f59e0b" },
  { id: "mythic", label: "Мифический", color: "#e0344a" },
];

export function rarityMeta(id: RarityId) {
  return RARITIES.find((r) => r.id === id) ?? RARITIES[0];
}

// ─── Расчёт силы героя ────────────────────────────────────────────────────────

export interface HeroStats {
  level: number;
  stars: number;
  attack: number;
  hp: number;
  defense: number;
  speed: number;
  heroClass: HeroClassId;
}

export interface PowerBreakdown {
  attack: number;
  hp: number;
  defense: number;
  speed: number;
  base: number;
  levelMult: number;
  starMult: number;
  classMult: number;
  total: number;
}

export const STAT_WEIGHTS = { attack: 2.35, defense: 1.85, speedCount: 14, hp: 0.42 };

export function starMultiplier(stars: number): number {
  return 1 + (clamp(stars, 1, MAX_STARS) - 1) * 0.28;
}

export function levelMultiplier(level: number): number {
  return 1 + (clamp(level, 1, MAX_LEVEL) - 1) * 0.045;
}

export function computePower(s: HeroStats): PowerBreakdown {
  const attack = s.attack * STAT_WEIGHTS.attack;
  const hp = s.hp * STAT_WEIGHTS.hp;
  const defense = s.defense * STAT_WEIGHTS.defense;
  const speed = s.speed * STAT_WEIGHTS.speedCount;
  const base = attack + hp + defense + speed;
  const levelMult = levelMultiplier(s.level);
  const starMult = starMultiplier(s.stars);
  const classMult = heroClassMeta(s.heroClass).powerMult;
  return {
    attack,
    hp,
    defense,
    speed,
    base,
    levelMult,
    starMult,
    classMult,
    total: Math.round(base * levelMult * starMult * classMult),
  };
}

// Ранг силы — титул для игрока
export function powerRank(power: number): string {
  if (power >= 400_000) return "Древний владыка";
  if (power >= 250_000) return "Властелин ночи";
  if (power >= 150_000) return "Высший вампир";
  if (power >= 80_000) return "Князь теней";
  if (power >= 30_000) return "Старейшина клана";
  if (power >= 10_000) return "Неофит ночи";
  return "Пробуждённый";
}

// ─── Калькулятор прокачки ─────────────────────────────────────────────────────

export interface LevelCost {
  level: number; // переход level → level+1
  blood: number;
  souls: number;
  gold: number;
}

function round10(n: number) {
  return Math.round(n / 10) * 10;
}

export function costForLevel(level: number): Omit<LevelCost, "level"> {
  const l = Math.max(1, level);
  return {
    blood: round10(60 * Math.pow(l, 2.0)),
    souls: Math.round(Math.pow(l, 1.6)),
    gold: round10(240 * Math.pow(l, 1.7)),
  };
}

export function levelingCost(from: number, to: number): LevelCost[] {
  const start = clamp(Math.min(from, to), 1, MAX_LEVEL - 1);
  const end = clamp(Math.max(from, to), 2, MAX_LEVEL);
  const rows: LevelCost[] = [];
  for (let l = start; l < end; l++) {
    rows.push({ level: l, ...costForLevel(l) });
  }
  return rows;
}

export function sumLeveling(rows: LevelCost[]) {
  return rows.reduce(
    (acc, r) => ({
      blood: acc.blood + r.blood,
      souls: acc.souls + r.souls,
      gold: acc.gold + r.gold,
    }),
    { blood: 0, souls: 0, gold: 0 },
  );
}

// ─── Калькулятор пробуждения (звёзды) ────────────────────────────────────────

export interface AwakenStep {
  from: number; // звёзд сейчас
  to: number;
  essence: number;
  shards: number;
  duplicates: number;
}

export function awakeningSteps(from: number, to: number): AwakenStep[] {
  const start = clamp(Math.min(from, to), 1, MAX_STARS - 1);
  const end = clamp(Math.max(from, to), 2, MAX_STARS);
  const steps: AwakenStep[] = [];
  for (let s = start; s < end; s++) {
    steps.push({
      from: s,
      to: s + 1,
      essence: 40 * s * s,
      shards: 25 * s,
      duplicates: Math.ceil(s / 3),
    });
  }
  return steps;
}

export function sumAwakening(steps: AwakenStep[]) {
  return steps.reduce(
    (acc, s) => ({
      essence: acc.essence + s.essence,
      shards: acc.shards + s.shards,
      duplicates: acc.duplicates + s.duplicates,
    }),
    { essence: 0, shards: 0, duplicates: 0 },
  );
}

// ─── Утилиты ──────────────────────────────────────────────────────────────────

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}

export function abbrNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} млн`;
  if (n >= 10_000) return `${Math.round(n / 1000)} тыс.`;
  return String(Math.round(n));
}
