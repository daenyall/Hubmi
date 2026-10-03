const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export interface HealthStatus {
  status: string;
  app_name: string;
  environment: string;
  supabase_connected: boolean;
}

export interface HelloResponse {
  message: string;
  data?: Record<string, any>;
}

export async function checkBackendHealth(): Promise<HealthStatus | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
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
  } catch (error) {
    return null;
  }
}

export interface MatchItem {
  id: string;
  title: string;
  similarity_score: number;
  why_relevant?: string;
  source_url?: string;
  target_group?: string;
  category?: string;
  description?: string;
  status: string;
}

export interface MatchResponse {
  matches: MatchItem[];
  query?: string;
  total_found: number;
}

export async function matchInnovations(problemDescription: string): Promise<MatchResponse | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        problem_description: problemDescription,
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
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
  innovationDescription?: string
): Promise<AdaptResponse | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/adapt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        innovation_title: innovationTitle,
        municipality_context: municipalityContext,
        innovation_description: innovationDescription,
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    return null;
  }
}
