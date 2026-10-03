import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig, timedSupabaseFetch } from "./config";

export function createClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Brakuje publicznej konfiguracji Supabase.");
  return createBrowserClient(config.url, config.key, { global: { fetch: timedSupabaseFetch } });
}
