import type { Metadata } from "next";
import { LevelingCalculator } from "./leveling-calculator";

export const metadata: Metadata = { title: "Прокачка" };

export default function LevelingPage() {
  return <LevelingCalculator />;
}
