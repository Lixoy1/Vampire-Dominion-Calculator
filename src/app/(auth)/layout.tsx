import type { ReactNode } from "react";
import Image from "next/image";
import { Droplet } from "lucide-react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="bg-veil flex min-h-screen">
      {/* Панель формы */}
      <div className="relative flex w-full flex-col justify-center px-6 py-10 sm:px-12 lg:w-[46%] lg:px-16 xl:px-24">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-obsidian/40 to-transparent lg:hidden" />
        <div className="relative mx-auto w-full max-w-md">
          <div className="mb-10 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-b from-blood-2 to-blood-deep shadow-[0_0_28px_rgba(224,52,74,0.45)]">
              <Droplet size={20} className="text-white" fill="currentColor" />
            </span>
            <div>
              <p className="font-display text-lg font-bold tracking-[0.18em] text-bone">NOCTURNE</p>
              <p className="text-[10px] uppercase tracking-[0.24em] text-smoke">
                калькулятор «Наследие Вампиров»
              </p>
            </div>
          </div>
          {children}
        </div>
      </div>

      {/* Арт-панель */}
      <div className="relative hidden flex-1 overflow-hidden lg:block">
        <Image
          src="/images/auth-art.jpg"
          alt="Цитадель вампиров под кровавой луной"
          fill
          priority
          className="animate-drift object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-obsidian via-obsidian/35 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian/95 via-transparent to-obsidian/40" />
        <div className="absolute bottom-0 left-0 right-0 p-12 xl:p-16">
          <p className="font-display max-w-xl text-2xl font-semibold leading-snug text-bone xl:text-3xl">
            «Каждая капля крови должна быть сочтена, пока луна не достигла зенита»
          </p>
          <p className="mt-4 text-sm uppercase tracking-[0.28em] text-blood-2/90">
            — летопись клана, круг III
          </p>
        </div>
      </div>
    </main>
  );
}
