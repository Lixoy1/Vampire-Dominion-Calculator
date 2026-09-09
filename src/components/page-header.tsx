import type { ReactNode } from "react";
import { FadeIn } from "@/components/ui";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <FadeIn className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-xl font-bold uppercase tracking-[0.06em] text-bone sm:text-2xl">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ash">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </FadeIn>
  );
}
