import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { heroes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PowerCalculator } from "./power-calculator";

export const metadata: Metadata = { title: "Сила героя" };

export default async function PowerPage({
  searchParams,
}: {
  searchParams: Promise<{ hero?: string }>;
}) {
  const user = await requireUser();
  const { hero } = await searchParams;
  const heroRows = await db.select().from(heroes).where(eq(heroes.userId, user.id));
  return <PowerCalculator heroes={heroRows} initialHeroId={hero ?? null} />;
}
