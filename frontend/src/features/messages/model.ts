import { isUuid } from "../submissions/model";
export const MESSAGE_LIMIT = 5000;
/** sender_id jest propozycją do wdrożenia przez A; pozostałe kolumny już istnieją. */
export const MESSAGE_COLUMNS = "id,submission_id,sender_id,sender_role,sender_name,message,created_at";
export interface Message {
  id: string; submission_id: string; sender_id: string; sender_role: "applicant" | "rops_admin";
  sender_name: string; message: string; created_at: string;
}
export function validateMessage(text: string): string | null {
  if (!text.trim()) return "Wpisz treść wiadomości.";
  if (text.trim().length > MESSAGE_LIMIT) return `Wiadomość może mieć maksymalnie ${MESSAGE_LIMIT} znaków.`;
  return null;
}
export function messagePayload(id: string, submissionId: string, text: string) {
  return { id, submission_id: submissionId, message: text.trim() };
}
export function parseMessage(value: unknown, submissionId: string): Message {
  if (typeof value !== "object" || value === null) throw new Error("Niepoprawna wiadomość.");
  const row = value as Record<string, unknown>;
  for (const field of ["id", "sender_id", "submission_id"]) if (typeof row[field] !== "string" || !isUuid(row[field] as string)) throw new Error("Niepoprawny identyfikator wiadomości.");
  if (row.submission_id !== submissionId || !["applicant", "rops_admin"].includes(String(row.sender_role)) ||
      typeof row.sender_name !== "string" || !row.sender_name.trim() ||
      typeof row.message !== "string" || validateMessage(row.message) ||
      typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at))) throw new Error("Niepoprawna treść wiadomości.");
  return row as unknown as Message;
}
