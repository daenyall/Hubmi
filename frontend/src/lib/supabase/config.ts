/** Publiczna konfiguracja. Klucz tajny nigdy nie jest akceptowany przez klienta. */
export function isPublicSupabaseKey(key: string): boolean {
  if (key.startsWith("sb_publishable_") && key.length > 20) return true;
  try {
    const payload = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "anon";
  } catch {
    return false;
  }
}

export function getSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol) || !isPublicSupabaseKey(key)) return null;
    return { url, key };
  } catch {
    return null;
  }
}

export const SUBMISSIONS_ENABLED = process.env.NEXT_PUBLIC_SUBMISSIONS_ENABLED === "true";
export const SUPABASE_TIMEOUT_MS = 20_000;

/** Limit obejmuje nagłówki i odczyt body przez SDK. */
export async function timedSupabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), SUPABASE_TIMEOUT_MS);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    // SDK otrzymuje dopiero w pełni odczytaną odpowiedź, zanim usuniemy timer.
    const body = await response.arrayBuffer();
    return new Response([204, 205, 304].includes(response.status) ? null : body, {
      status: response.status, statusText: response.statusText, headers: response.headers,
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
