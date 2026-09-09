"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { artifacts, heroes, type Artifact } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ARTIFACT_SLOTS, RARITIES, clamp, type ArtifactSlotId, type RarityId } from "@/lib/game";

export interface ArtifactInput {
  name: string;
  slot: ArtifactSlotId;
  rarity: RarityId;
  attackBonus: number;
  hpBonus: number;
  defenseBonus: number;
  speedBonus: number;
  heroId: string | null;
}

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function sanitize(input: ArtifactInput) {
  return {
    name: input.name.trim().slice(0, 80),
    slot: ARTIFACT_SLOTS.some((s) => s.id === input.slot) ? input.slot : ("weapon" as const),
    rarity: RARITIES.some((r) => r.id === input.rarity) ? input.rarity : ("rare" as const),
    attackBonus: clamp(Math.round(input.attackBonus), 0, 999_999),
    hpBonus: clamp(Math.round(input.hpBonus), 0, 9_999_999),
    defenseBonus: clamp(Math.round(input.defenseBonus), 0, 999_999),
    speedBonus: clamp(Math.round(input.speedBonus), 0, 999),
  };
}

function revalidateArtifacts() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/artifacts");
}

async function validateHeroId(heroId: string | null, userId: string): Promise<string | null> {
  if (!heroId) return null;
  const [h] = await db.select({ id: heroes.id }).from(heroes).where(and(eq(heroes.id, heroId), eq(heroes.userId, userId))).limit(1);
  return h?.id ?? null;
}

export async function createArtifact(input: ArtifactInput): Promise<ActionResult<Artifact>> {
  const user = await requireUser();
  const data = sanitize(input);
  if (!data.name) return { ok: false, error: "Укажите название артефакта" };
  const heroId = await validateHeroId(input.heroId, user.id);
  const [row] = await db.insert(artifacts).values({ ...data, heroId, userId: user.id }).returning();
  revalidateArtifacts();
  return { ok: true, data: row };
}

export async function updateArtifact(id: string, input: ArtifactInput): Promise<ActionResult<Artifact>> {
  const user = await requireUser();
  const data = sanitize(input);
  if (!data.name) return { ok: false, error: "Укажите название артефакта" };
  const heroId = await validateHeroId(input.heroId, user.id);
  const [row] = await db.update(artifacts).set({ ...data, heroId }).where(and(eq(artifacts.id, id), eq(artifacts.userId, user.id))).returning();
  if (!row) return { ok: false, error: "Артефакт не найден" };
  revalidateArtifacts();
  return { ok: true, data: row };
}

export async function deleteArtifact(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const [row] = await db.delete(artifacts).where(and(eq(artifacts.id, id), eq(artifacts.userId, user.id))).returning({ id: artifacts.id });
  if (!row) return { ok: false, error: "Артефакт не найден" };
  revalidateArtifacts();
  return { ok: true, data: row };
}
