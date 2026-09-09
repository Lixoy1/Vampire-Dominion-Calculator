"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Swords, Target, Gem, Calculator, LogOut, Menu, X, MoonStar } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { logoutAction } from "@/app/(auth)/actions";

const MAIN_NAV = [
  { href: "/dashboard", label: "Обзор", icon: LayoutDashboard },
  { href: "/dashboard/heroes", label: "Герои", icon: Swords },
  { href: "/dashboard/artifacts", label: "Артефакты", icon: Gem },
  { href: "/dashboard/goals", label: "Цели", icon: Target },
  { href: "/dashboard/calculators", label: "Калькуляторы", icon: Calculator },
];

export function Sidebar({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const content = (
    <div className="flex h-full flex-col px-4 py-5">
      <div className="mb-7 flex items-center gap-3 px-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-b from-blood-2 to-blood-deep shadow-[0_0_28px_rgba(224,52,74,0.38)]">
          <MoonStar size={19} className="text-white" />
        </span>
        <div className="min-w-0">
          <p className="font-display truncate text-sm font-bold tracking-[0.16em] text-bone">NOCTURNE</p>
          <p className="truncate text-[9px] uppercase tracking-[0.19em] text-smoke">Наследие Вампиров</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-smoke">Обитель</p>
        {MAIN_NAV.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all",
                active ? "bg-blood/12 text-bone shadow-[inset_0_0_0_1px_rgba(224,52,74,0.18)]" : "text-ash hover:bg-white/[0.035] hover:text-bone",
              )}
            >
              <item.icon size={17} className={cn(active ? "text-blood-2" : "text-smoke group-hover:text-ash")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-6">
        <div className="rounded-2xl border border-line bg-crypt-2/70 p-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blood/12 text-sm font-bold text-blood-2">
              {user.name.trim().slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-bone">{user.name}</p>
              <p className="truncate text-[10px] text-smoke">{user.email}</p>
            </div>
          </div>
          <form action={logoutAction} className="mt-3">
            <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
              <LogOut size={14} /> Выйти
            </Button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-obsidian/90 px-4 backdrop-blur-lg lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <MoonStar size={17} className="text-blood-2" />
          <span className="font-display text-xs font-bold tracking-[0.16em] text-bone">NOCTURNE</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="rounded-lg p-2 text-ash hover:bg-white/5 hover:text-bone"
          aria-label="Меню"
        >
          {mobileOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[272px] border-r border-line bg-obsidian/95 backdrop-blur-xl lg:block">
        {content}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside
            className="h-full w-[290px] border-r border-line bg-obsidian shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
