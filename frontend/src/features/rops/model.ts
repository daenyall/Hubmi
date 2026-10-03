import { isUuid, parseSubmission, SUBMISSION_COLUMNS, STATUS_LABELS, type Submission } from "../submissions/model";
export const REVIEW_COLUMNS = `${SUBMISSION_COLUMNS},official_response`;
export type Review = Submission & { official_response: string | null };
export function isStatus(value: string): boolean { return Object.hasOwn(STATUS_LABELS, value); }
export function parseReview(value: unknown): Review {
  if (typeof value !== "object" || value === null) throw new Error("Niepoprawne zgłoszenie.");
  const row = value as Record<string, unknown>;
  if (typeof row.user_id !== "string" || !isUuid(row.user_id) || !isStatus(String(row.status)) ||
    !(row.official_response === null || typeof row.official_response === "string")) throw new Error("Niepełne dane zgłoszenia.");
  return { ...parseSubmission(row, row.user_id), official_response: row.official_response };
}
export function validateOfficialResponse(text: string): string | null {
  if (!text.trim()) return "Wpisz oficjalną odpowiedź.";
  if (text.trim().length > 10000) return "Oficjalna odpowiedź może mieć maksymalnie 10000 znaków.";
  return null;
}
