import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Unbounded, Manrope } from "next/font/google";
import "./globals.css";

const unbounded = Unbounded({
  subsets: ["latin", "cyrillic"],
  variable: "--font-unbounded",
  weight: ["400", "500", "600", "700", "800"],
});

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "NOCTURNE — калькулятор «Наследие Вампиров»",
    template: "%s · NOCTURNE",
  },
  description:
    "Калькуляторы и трекер прогресса для игры «Наследие Вампиров»: сила героя, прокачка, пробуждение, цели по ресурсам.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${unbounded.variable} ${manrope.variable}`}>
      <body className="bg-obsidian text-bone antialiased noise">{children}</body>
    </html>
  );
}
