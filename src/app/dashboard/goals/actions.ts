"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { goals, type Goal } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { RESOURCES, clamp, type ResourceId } from "@/lib/game";

export interface GoalInput {
  title: string;
  note: string;
  resource: ResourceId;
  targetAmount: number;
  currentAmount: number;
  deadline: string | null;
}

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function sanitize(input: GoalInput) {
  const target = clamp(Math.round(input.targetAmount), 1, 999_999_999);
  return {
    title: input.title.trim().slice(0, 90),
    note: (input.note ?? "").slice(0, 300),
    resource: RESOURCES.some((r) => r.id === input.resource) ? input.resource : ("blood" as const),
    targetAmount: target,
    currentAmount: clamp(Math.round(input.currentAmount), 0, target),
    deadline: input.deadline && /^\d{4}-\d{2}-\d{2}$/.test(input.deadline) ? input.deadline : null,
  };
}

function revalidateGoals() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/goals");
}

export async function createGoal(input: GoalInput): Promise<ActionResult<Goal>> {
  const user = await requireUser();
  const data = sanitize(input);
  if (!data.title) return { ok: false, error: "Укажите название цели" };
  const [row] = await db.insert(goals).values({ ...data, userId: user.id }).returning();
  revalidateGoals();
  return { ok: true, data: row };
}

export async function updateGoal(id: string, input: GoalInput): Promise<ActionResult<Goal>> {
  const user = await requireUser();
  const data = sanitize(input);
  if (!data.title) return { ok: false, error: "Укажите название цели" };
  const [row] = await db
    .update(goals)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(goals.id, id), eq(goals.userId, user.id)))
    .returning();
  if (!row) return { ok: false, error: "Цель не найдена" };
  revalidateGoals();
  return { ok: true, data: row };
}

export async function deleteGoal(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const [row] = await db
    .delete(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, user.id)))
    .returning({ id: goals.id });
  if (!row) return { ok: false, error: "Цель не найдена" };
  revalidateGoals();
  return { ok: true, data: row };
}

/** Быстрое обновление прогресса: выставить новое значение (клэмпится на сервере). */
export async function setGoalProgress(id: string, currentAmount: number): Promise<ActionResult<Goal>> {
  const user = await requireUser();
  const [current] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, user.id)))
    .limit(1);
  if (!current) return { ok: false, error: "Цель не найдена" };
  const value = clamp(Math.round(currentAmount), 0, current.targetAmount);
  const [row] = await db
    .update(goals)
    .set({ currentAmount: value, updatedAt: new Date() })
    .where(eq(goals.id, id))
    .returning();
  revalidateGoals();
  return { ok: true, data: row };
}
