import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { artifacts, heroes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ArtifactsClient } from "./artifacts-client";

export const metadata: Metadata = { title: "Артефакты" };

export default async function ArtifactsPage() {
  const user = await requireUser();
  const [artifactRows, heroRows] = await Promise.all([
    db.select().from(artifacts).where(eq(artifacts.userId, user.id)).orderBy(desc(artifacts.createdAt)),
    db.select({ id: heroes.id, name: heroes.name }).from(heroes).where(eq(heroes.userId, user.id)),
  ]);
  return <ArtifactsClient initialArtifacts={artifactRows} heroes={heroRows} />;
}
