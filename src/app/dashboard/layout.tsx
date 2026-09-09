import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/shell/sidebar";
import { ToastProvider } from "@/components/toast";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <ToastProvider>
      <div className="bg-veil min-h-screen">
        <Sidebar user={{ name: user.name, email: user.email }} />
        <div className="lg:pl-[272px]">
          <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6 sm:px-8 lg:pb-12 lg:pt-10">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
