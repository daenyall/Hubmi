"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseConfig } from "@/lib/supabase/config";

type AuthState =
  | { status: "loading" | "anonymous" | "unavailable" }
  | { status: "error"; message: string }
  | { status: "authenticated"; user: User };
interface AuthContextValue {
  state: AuthState;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => getSupabaseConfig() ? { status: "loading" } : { status: "unavailable" });
  const generation = useRef(0);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    try {
      const { data, error } = await createClient().auth.getUser();
      if (!mounted.current || version !== generation.current) return;
      if (error && error.name !== "AuthSessionMissingError" && error.status !== 401 && error.status !== 403) {
        setState({ status: "error", message: "Nie udało się sprawdzić sesji. Spróbuj ponownie." });
      } else setState(data.user ? { status: "authenticated", user: data.user } : { status: "anonymous" });
    } catch {
      if (mounted.current && version === generation.current) setState({ status: "error", message: "Usługa logowania jest niedostępna. Spróbuj ponownie." });
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!getSupabaseConfig()) return () => { mounted.current = false; };
    const client = createClient();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        ++generation.current;
        if (mounted.current) setState({ status: "anonymous" });
      } else {
        // Nie wywołujemy metod Auth wewnątrz callbacka SDK.
        const timer = setTimeout(() => { timers.delete(timer); void refresh(); }, 0);
        timers.add(timer);
      }
    });
    const initialTimer = setTimeout(() => { timers.delete(initialTimer); void refresh(); }, 0);
    timers.add(initialTimer);
    return () => {
      mounted.current = false;
      timers.forEach(clearTimeout);
      subscription.unsubscribe();
    };
  }, [refresh]);

  const signIn = async (email: string, password: string) => {
    const client = createClient();
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.session) {
      throw new Error(error?.status === 429 ? "Zbyt wiele prób. Poczekaj chwilę i spróbuj ponownie." : "Nie udało się zalogować. Sprawdź email i hasło lub spróbuj ponownie za chwilę.");
    }
    const verified = await client.auth.getUser();
    if (verified.error || !verified.data.user) throw new Error("Nie udało się potwierdzić sesji. Spróbuj zalogować się ponownie.");
    ++generation.current;
    if (mounted.current) setState({ status: "authenticated", user: verified.data.user });
  };
  const signOut = async () => {
    ++generation.current;
    const { error } = await createClient().auth.signOut({ scope: "local" });
    if (error) throw new Error("Nie udało się wylogować. Spróbuj ponownie.");
    if (mounted.current) setState({ status: "anonymous" });
  };
  return <AuthContext.Provider value={{ state, refresh, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("Brakuje AuthProvider.");
  return context;
}
