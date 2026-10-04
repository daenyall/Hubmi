import type { SupabaseClient } from "@supabase/supabase-js";
import { BackendApiError, requestBackendJson, type BackendResult } from "../../lib/api";
import { createClient } from "../../lib/supabase/client";
import { isUuid } from "../submissions/model";
import { roleFromVerifiedUser } from "./access";

type Kind = "auth" | "access" | "validation" | "not_found" | "network" | "response" | "timeout" | "server" | "configuration";

/** Błąd wywołania FastAPI z sesją Supabase; komunikat jest gotowy do pokazania. */
export class BackendCallError extends Error {
  constructor(public readonly kind: Kind, message: string) { super(message); this.name = "BackendCallError"; }
}

export function backendCallMessage(error: unknown): string {
  if (error instanceof BackendCallError || error instanceof BackendApiError) return error.message;
  return "Nie udało się połączyć z usługą. Spróbuj ponownie za chwilę.";
}

/** Wspólne tłumaczenie statusów HTTP. `writing` dopisuje informację o zachowanej treści formularza. */
export function httpCallError(status: number, writing: boolean, subject: string): BackendCallError {
  const tail = writing ? " Wpisana treść pozostała w formularzu." : "";
  if (status === 401) return new BackendCallError("auth", `Sesja wygasła lub token nie został przyjęty. Zaloguj się ponownie.${tail}`);
  if (status === 403) return new BackendCallError("access", `To konto nie ma uprawnień do tej operacji (${subject}).${tail}`);
  if (status === 404) return new BackendCallError("not_found", `Nie znaleziono rekordu (${subject}). Odśwież listę.`);
  if (status === 400 || status === 422) return new BackendCallError("validation", `Usługa odrzuciła dane (${subject}). Sprawdź pola formularza.${tail}`);
  if (status === 429) return new BackendCallError("network", `Zbyt wiele zapytań. Poczekaj chwilę i spróbuj ponownie.${tail}`);
  if (status === 503) return new BackendCallError("server", `Baza danych jest chwilowo niedostępna (${subject}).${tail}`);
  return new BackendCallError("server", `Usługa nie potwierdziła operacji (${subject}, kod ${status}).${tail}`);
}

/** FastAPI zwraca `detail` jako tekst przy 400; pokazujemy go, bo zawiera konkretną przyczynę. */
export function detailOf(result: BackendResult): string {
  const data = result.data;
  if (typeof data === "object" && data !== null && "detail" in data && typeof data.detail === "string") return data.detail.trim();
  return "";
}

async function verifiedToken(client: SupabaseClient, requireRops: boolean, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const { data, error } = await client.auth.getUser();
  signal?.throwIfAborted();
  if (error || !data.user || !isUuid(data.user.id)) throw new BackendCallError("auth", "Sesja wygasła lub nie można jej potwierdzić. Zaloguj się ponownie.");
  if (data.user.is_anonymous === true) throw new BackendCallError("auth", "Konto anonimowe nie ma dostępu do tej operacji. Zaloguj się na konto email.");
  if (requireRops) {
    let role: string;
    try { role = roleFromVerifiedUser(data.user); }
    catch { throw new BackendCallError("access", "Nie można potwierdzić uprawnień tego konta."); }
    if (role !== "rops_admin") throw new BackendCallError("access", "To konto nie ma potwierdzonych uprawnień pracownika ROPS.");
  }
  const session = await client.auth.getSession();
  signal?.throwIfAborted();
  const token = session.data.session?.access_token;
  if (session.error || typeof token !== "string" || !token) throw new BackendCallError("auth", "Nie udało się odczytać tokenu bieżącej sesji. Zaloguj się ponownie.");
  return token;
}

export interface CallResult extends BackendResult { authenticated: boolean }

/** Bez publicznej konfiguracji Supabase zwracamy null — formularze publiczne działają dalej. */
export function browserClientOrNull(): SupabaseClient | null {
  try { return createClient(); } catch { return null; }
}

/**
 * Wywołania FastAPI w imieniu zalogowanej osoby. Rola ROPS pochodzi z app_metadata
 * zweryfikowanego przez getUser; ostateczną decyzję i tak podejmuje backend (403).
 */
export function createBackendSession(client: SupabaseClient | null = browserClientOrNull()) {
  /** rops: wymagana rola ROPS; user: wymagane konto; optional: token tylko, gdy ktoś jest zalogowany. */
  async function call(path: string, init: { method?: string; body?: unknown }, mode: "rops" | "user" | "optional", signal?: AbortSignal): Promise<CallResult> {
    let token: string | undefined;
    if (mode === "optional") {
      if (client) {
        const { data } = await client.auth.getSession();
        signal?.throwIfAborted();
        const session = data.session;
        if (session && session.user.is_anonymous !== true && typeof session.access_token === "string") token = session.access_token;
      }
    } else {
      if (!client) throw new BackendCallError("configuration", "Logowanie jest niedostępne: brakuje publicznej konfiguracji połączenia.");
      token = await verifiedToken(client, mode === "rops", signal);
    }
    const result = await requestBackendJson(path, { ...init, token, signal });
    signal?.throwIfAborted();
    return { ...result, authenticated: Boolean(token) };
  }
  /** Sprawdza sesję i rolę ROPS przed pokazaniem panelu; backend i tak odrzuci brak roli (403). */
  async function verifyRops(signal?: AbortSignal): Promise<true> {
    if (!client) throw new BackendCallError("configuration", "Logowanie jest niedostępne: brakuje publicznej konfiguracji połączenia.");
    await verifiedToken(client, true, signal);
    return true;
  }
  return { call, verifyRops };
}
