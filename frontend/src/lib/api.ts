import { parseMatchResponse, MAX_PROBLEM_LENGTH, MIN_PROBLEM_LENGTH, type BackendMatchResponse, type MatchRequest, type MatchResponse as MatchingResult } from "./matching";
export type { BackendMatchItem as MatchItem, BackendMatchResponse as MatchResponse } from "./matching";

const BACKEND_URL =
  (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/+$/, "");

export const USE_MOCK_MATCHING =
  process.env.NEXT_PUBLIC_USE_MOCK_MATCHING === "true";
export const MATCH_TIMEOUT_MS = 20_000;

type MatchErrorKind = "validation" | "network" | "api" | "response" | "timeout";

/** FastAPI zwraca detail jako tekst (400) lub listę pól Pydantic (422); listy nie pokazujemy. */
async function describedValidationError(response: Response): Promise<string> {
  const fallback = `Usługa nie przyjęła tego opisu. Podaj od ${MIN_PROBLEM_LENGTH} do ${MAX_PROBLEM_LENGTH} znaków opisujących potrzebę.`;
  try {
    const data: unknown = await response.json();
    if (typeof data === "object" && data !== null && "detail" in data && typeof data.detail === "string" && data.detail.trim()) {
      return data.detail.trim();
    }
  } catch { /* Brak czytelnego detail nie zmienia rodzaju błędu. */ }
  return fallback;
}

export class MatchApiError extends Error {
  constructor(
    public readonly kind: MatchErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "MatchApiError";
  }
}

/** POST /api/match zgodnie ze schematami backendu. */
async function requestMatches(
  request: MatchRequest,
  signal?: AbortSignal,
): Promise<BackendMatchResponse> {
  const problemDescription = request.problem_description.trim();
  if (!problemDescription) {
    throw new MatchApiError("validation", "Opisz problem lub potrzebę, aby znaleźć rozwiązania.");
  }

  if (problemDescription.length < MIN_PROBLEM_LENGTH) {
    throw new MatchApiError("validation", `Opis potrzeby musi zawierać co najmniej ${MIN_PROBLEM_LENGTH} znaki.`);
  }

  // Limit backendu (MatchRequest.max_length); bez tego długi opis kończy się surowym 422.
  if (problemDescription.length > MAX_PROBLEM_LENGTH) {
    throw new MatchApiError("validation", `Opis może mieć maksymalnie ${MAX_PROBLEM_LENGTH} znaków. Skróć opis i spróbuj ponownie.`);
  }

  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, MATCH_TIMEOUT_MS);

  try {
    controller.signal.throwIfAborted();
    if (USE_MOCK_MATCHING) {
      const { getMockMatches } = await import("./mock-matching");
      const data = await getMockMatches(problemDescription, controller.signal);
      parseMatchResponse(data);
      return data;
    }

    const response = await fetch(`${BACKEND_URL}/api/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...request, problem_description: problemDescription }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      // 400 i 422 to odrzucenie opisu przez kontrakt, nie awaria usługi.
      if (response.status === 400 || response.status === 422) {
        throw new MatchApiError("validation", await describedValidationError(response), response.status);
      }
      throw new MatchApiError(
        "api",
        response.status === 429
          ? "Zbyt wiele zapytań. Poczekaj chwilę i spróbuj ponownie."
          : "Nie udało się pobrać dopasowań. Spróbuj ponownie za chwilę.",
        response.status,
      );
    }

    try {
      const data: unknown = await response.json();
      parseMatchResponse(data);
      return data as BackendMatchResponse;
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new MatchApiError(
        "response",
        "Otrzymaliśmy niepoprawną odpowiedź. Spróbuj ponownie za chwilę.",
      );
    }
  } catch (error) {
    if (timedOut) {
      throw new MatchApiError(
        "timeout",
        "Wyszukiwanie trwało zbyt długo. Spróbuj ponownie za chwilę.",
      );
    }
    if (signal?.aborted) throw error;
    if (error instanceof MatchApiError) throw error;
    throw new MatchApiError(
      "network",
      "Nie udało się połączyć z usługą. Sprawdź połączenie i spróbuj ponownie.",
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

export interface HealthStatus {
  status: string;
  app_name: string;
  environment: string;
  supabase_connected: boolean;
}

export interface HelloResponse {
  message: string;
  data?: Record<string, unknown>;
}

export async function checkBackendHealth(): Promise<HealthStatus | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchHello(): Promise<HelloResponse | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/example/hello`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Znormalizowane dane kart; pola backendu są mapowane w matching.ts. */
export async function matchProblem(request: MatchRequest, signal?: AbortSignal): Promise<MatchingResult> {
  return parseMatchResponse(await requestMatches(request, signal));
}

/** Zachowany klient z upstreamu, zwracający kontrakt backendu. */
export async function matchInnovations(problemDescription: string): Promise<BackendMatchResponse | null> {
  try {
    return await requestMatches({ problem_description: problemDescription });
  } catch {
    return null;
  }
}

export interface AdaptResponse {
  innovation_title: string;
  adaptation_plan: string;
}

export async function adaptInnovation(
  innovationTitle: string,
  municipalityContext: string,
  innovationDescription?: string,
  signal?: AbortSignal,
): Promise<AdaptResponse> {
  if (USE_MOCK_MATCHING) throw new Error("Plan adaptacji wymaga połączenia z usługą.");
  if (municipalityContext.trim().length < 5) {
    throw new Error("Opisz kontekst swojej instytucji, używając co najmniej 5 znaków.");
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, MATCH_TIMEOUT_MS);
  try {
    controller.signal.throwIfAborted();
    const response = await fetch(`${BACKEND_URL}/api/adapt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        innovation_title: innovationTitle,
        municipality_context: municipalityContext.trim(),
        ...(innovationDescription ? { innovation_description: innovationDescription } : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Nie udało się wygenerować planu. Spróbuj ponownie za chwilę.");
    const data: unknown = await response.json();
    if (
      typeof data !== "object" || data === null ||
      !("innovation_title" in data) || typeof data.innovation_title !== "string" ||
      !("adaptation_plan" in data) || typeof data.adaptation_plan !== "string" ||
      !data.adaptation_plan.trim()
    ) throw new Error("Otrzymaliśmy niepoprawny plan adaptacji.");
    return { innovation_title: data.innovation_title, adaptation_plan: data.adaptation_plan };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) throw new Error("Generowanie planu trwało zbyt długo. Spróbuj ponownie.");
    if (error instanceof SyntaxError) throw new Error("Otrzymaliśmy niepoprawny plan adaptacji.");
    if (error instanceof TypeError) throw new Error("Nie udało się połączyć z usługą. Spróbuj ponownie.");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

export class BackendApiError extends Error {
  constructor(public readonly kind: "network" | "api" | "response" | "timeout", message: string, public readonly status?: number) {
    super(message); this.name = "BackendApiError";
  }
}

/** Publiczny GET z istniejącą konfiguracją backendu i limitem 20 s, także na body. */
export async function getBackendJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, MATCH_TIMEOUT_MS);
  try {
    controller.signal.throwIfAborted();
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method: "GET", headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal,
    });
    if (!response.ok) throw new BackendApiError("api", response.status === 429
      ? "Zbyt wiele zapytań. Poczekaj chwilę i spróbuj ponownie."
      : "Nie udało się pobrać katalogu. Spróbuj ponownie za chwilę.", response.status);
    try { return await response.json(); }
    catch (error) {
      if (controller.signal.aborted) throw error;
      throw new BackendApiError("response", "Otrzymaliśmy niepoprawną odpowiedź katalogu. Spróbuj ponownie.");
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) throw new BackendApiError("timeout", "Wczytywanie katalogu trwało zbyt długo. Spróbuj ponownie.");
    if (error instanceof BackendApiError) throw error;
    throw new BackendApiError("network", "Nie udało się połączyć z katalogiem. Sprawdź połączenie i spróbuj ponownie.");
  } finally { clearTimeout(timeout); signal?.removeEventListener("abort", onAbort); }
}

export interface BackendResult { ok: boolean; status: number; data: unknown }

/**
 * Żądanie do FastAPI z tokenem bieżącej sesji. Limit 20 s obejmuje też odczyt body.
 * Statusy HTTP zwracamy bez tłumaczenia — mapują je moduły domenowe.
 * Token trafia wyłącznie do nagłówka Authorization; nie jest logowany ani zapisywany.
 */
export async function requestBackendJson(
  path: string,
  { method = "GET", body, token, signal }: { method?: string; body?: unknown; token?: string; signal?: AbortSignal } = {},
): Promise<BackendResult> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, MATCH_TIMEOUT_MS);
  try {
    controller.signal.throwIfAborted();
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method, headers, cache: "no-store", signal: controller.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try { data = JSON.parse(text); }
      catch {
        if (controller.signal.aborted) controller.signal.throwIfAborted();
        throw new BackendApiError("response", "Otrzymaliśmy niepoprawną odpowiedź usługi. Spróbuj ponownie.", response.status);
      }
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) throw new BackendApiError("timeout", "Operacja trwała zbyt długo i nie została potwierdzona. Spróbuj ponownie.");
    if (error instanceof BackendApiError) throw error;
    throw new BackendApiError("network", "Nie udało się połączyć z usługą. Sprawdź połączenie i spróbuj ponownie.");
  } finally { clearTimeout(timeout); signal?.removeEventListener("abort", onAbort); }
}
