"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AlertCircle, Eye, EyeOff, MoonStar, UserPlus } from "lucide-react";
import { loginAction, registerAction, type AuthState } from "./actions";
import { Button, Field, Input } from "@/components/ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, null);
  const [showPassword, setShowPassword] = useState(false);
  const demoLogin = async (formData: FormData) => {
    await loginAction(null, formData);
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-bone sm:text-3xl">
        {mode === "login" ? "Вход в обитель" : "Присяга крови"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ash">
        {mode === "login"
          ? "Вернитесь к своим героям, расчётам и целям клана."
          : "Создайте аккаунт, чтобы сохранять героев, артефакты и планы развития."}
      </p>

      {state?.error && (
        <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-blood/40 bg-blood/10 px-4 py-3 text-sm text-blood-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {state.error}
        </div>
      )}

      <form action={formAction} className="mt-7 flex flex-col gap-4">
        {mode === "register" && (
          <Field label="Имя владыки">
            <Input name="name" placeholder="Например, Лорд Корвин" required minLength={2} autoComplete="name" />
          </Field>
        )}
        <Field label="Email">
          <Input name="email" type="email" placeholder="you@nocturne.app" required autoComplete="email" />
        </Field>
        <Field label="Пароль" hint={mode === "register" ? "минимум 6 символов" : undefined}>
          <div className="relative">
            <Input
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-smoke transition-colors hover:text-bone cursor-pointer"
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>

        <Button type="submit" size="lg" loading={pending} className="mt-2 w-full">
          {mode === "login" ? <MoonStar size={17} /> : <UserPlus size={17} />}
          {mode === "login" ? "Войти" : "Создать аккаунт"}
        </Button>
      </form>

      {mode === "login" && (
        <form action={demoLogin} className="mt-3">
          <input type="hidden" name="email" value="demo@nocturne.app" />
          <input type="hidden" name="password" value="demo1234" />
          <Button type="submit" variant="secondary" size="lg" className="w-full" loading={false}>
            Войти через демо-аккаунт
          </Button>
          <p className="mt-2 text-center text-[11px] text-smoke">
            demo@nocturne.app · demo1234 — с готовыми героями и данными
          </p>
        </form>
      )}

      <p className="mt-8 text-center text-sm text-ash">
        {mode === "login" ? (
          <>
            Ещё не в клане?{" "}
            <Link href="/register" className="font-semibold text-blood-2 transition-colors hover:text-bone">
              Принести присягу
            </Link>
          </>
        ) : (
          <>
            Уже среди бессмертных?{" "}
            <Link href="/login" className="font-semibold text-blood-2 transition-colors hover:text-bone">
              Войти
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
