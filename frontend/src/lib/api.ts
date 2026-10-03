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
