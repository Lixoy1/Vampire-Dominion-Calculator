import type { Metadata } from "next";
import { AwakeningCalculator } from "./awakening-calculator";

export const metadata: Metadata = { title: "Пробуждение" };

export default function AwakeningPage() {
  return <AwakeningCalculator />;
}
