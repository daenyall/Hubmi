/**
 * Bezpieczne odnośniki do zasobów zewnętrznych. Same zasoby Zasobnika pochodzą teraz
 * z trwałej tabeli knowledge_resources (resource-model.ts / resource-service.ts).
 */
export function isSafeResourceUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}
