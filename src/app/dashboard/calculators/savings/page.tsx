import type { Metadata } from "next";
import { SavingsCalculator } from "./savings-calculator";

export const metadata: Metadata = { title: "Накопления" };

export default function SavingsPage() {
  return <SavingsCalculator />;
}
