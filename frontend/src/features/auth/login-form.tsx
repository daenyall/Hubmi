"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingMessage, StatusMessage } from "@/components/status-message";
import { useAuth } from "./auth-provider";
import { safeReturnPath } from "./return-path";

export function LoginForm({ returnTo }: { returnTo?: string }) {
  const auth = useAuth();
  const router = useRouter();
  const id = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const active = useRef(false);
  const emailField = useRef<HTMLInputElement>(null);
  const passwordField = useRef<HTMLInputElement>(null);

  if (auth.state.status === "loading") return <LoadingMessage>Sprawdzamy sesję…</LoadingMessage>;
  if (auth.state.status === "unavailable") return <StatusMessage>Logowanie jest obecnie niedostępne: brakuje publicznej konfiguracji połączenia. Zapis zgłoszeń nie jest możliwy.</StatusMessage>;
  if (auth.state.status === "authenticated") return <StatusMessage>Jesteś zalogowany. <Link href={safeReturnPath(returnTo)} className="font-semibold underline underline-offset-4">Przejdź do {returnTo?.startsWith("/kreator") ? "kreatora" : "swoich zgłoszeń"}</Link>.</StatusMessage>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current) return;
    if (!/^[^\s@]+@[^\s@]+$/.test(email.trim())) { setError("Podaj poprawny adres email."); emailField.current?.focus(); return; }
    if (!password) { setError("Podaj hasło."); passwordField.current?.focus(); return; }
    active.current = true;
    setPending(true); setError("");
    try {
      await auth.signIn(email, password);
      setPassword("");
      if (returnTo) router.replace(safeReturnPath(returnTo));
    } catch (error) { setError(error instanceof Error ? error.message : "Nie udało się zalogować. Spróbuj ponownie."); }
    finally { active.current = false; setPending(false); }
  }
  return <Card className="max-w-xl rounded-2xl border border-border shadow-sm ring-0 [--card-spacing:24px]">
    <CardContent>
      <h2 className="mb-2 text-xl font-semibold">Zaloguj się</h2>
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">Użyj konta przygotowanego przez organizatora. Twoje zgłoszenia będą przypisane do tego konta.</p>
      {auth.state.status === "error" && <div className="mb-4 space-y-3"><StatusMessage error>{auth.state.message}</StatusMessage><Button variant="outline" onClick={() => void auth.refresh()} className="min-h-11">Ponów sprawdzenie sesji</Button></div>}
      <form onSubmit={submit} noValidate className="space-y-4" aria-busy={pending}>
        <div className="space-y-2"><label htmlFor={`${id}-email`} className="block font-semibold">Email (wymagane)</label>
          <Input id={`${id}-email`} ref={emailField} type="email" autoComplete="username" required value={email} readOnly={pending} onChange={(e) => { setEmail(e.target.value); setError(""); }} className="h-auto min-h-11 py-3 text-base md:text-base" />
        </div>
        <div className="space-y-2"><label htmlFor={`${id}-password`} className="block font-semibold">Hasło (wymagane)</label>
          <Input id={`${id}-password`} ref={passwordField} type="password" autoComplete="current-password" required value={password} readOnly={pending} onChange={(e) => { setPassword(e.target.value); setError(""); }} className="h-auto min-h-11 py-3 text-base md:text-base" />
        </div>
        {error && <StatusMessage error>{error}</StatusMessage>}
        <Button type="submit" disabled={pending} className="h-auto min-h-12 whitespace-normal px-[24px] py-3 text-base">{pending ? "Logujemy…" : "Zaloguj się"}</Button>
      </form>
    </CardContent>
  </Card>;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status !== "authenticated") return <div className="space-y-4"><p className="text-muted-foreground">Ten widok jest dostępny po zalogowaniu.</p><LoginForm /></div>;
  // Zmiana konta usuwa poprzednie komponenty i ich prywatne dane z pamięci widoku.
  return <div key={state.user.id}>{children}</div>;
}

export function AuthActions() {
  const auth = useAuth();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const active = useRef(false);
  if (auth.state.status === "loading") return <span className="text-muted-foreground">Sprawdzamy logowanie…</span>;
  if (auth.state.status !== "authenticated") return <Link href="/logowanie" className="inline-flex min-h-11 items-center rounded-sm text-primary underline-offset-4 hover:underline">Zaloguj się</Link>;
  return <div className="flex flex-wrap items-center gap-2">
    <Button variant="outline" disabled={pending} className="h-auto min-h-11 whitespace-normal px-[16px] py-2" onClick={async () => {
      if (active.current) return;
      active.current = true; setPending(true); setError("");
      try { await auth.signOut(); } catch (error) { setError(error instanceof Error ? error.message : "Nie udało się wylogować."); }
      finally { active.current = false; setPending(false); }
    }}>{pending ? "Wylogowujemy…" : "Wyloguj się"}</Button>
    {error && <p role="alert" className="max-w-xs text-red-900">{error}</p>}
  </div>;
}
