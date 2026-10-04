/** Model Testera innowacji. Kontrakt: backend/app/models/schemas.py (TestApplication*, TestFeedback*, *Summary). */
import { isUuid } from "../submissions/model";

export const TESTER_TYPES = ["JST", "CUS", "NGO", "Mieszkaniec", "Inna"] as const;
export const SCOPE_LABELS: Record<string, string> = {
  warsztaty: "Warsztaty", pilotaz_1m: "Pilotaż — 1 miesiąc", pilotaz_3m: "Pilotaż — 3 miesiące", wdrozenie_pelne: "Pełne wdrożenie",
};
/** Statusy z opisu TestApplicationStatusUpdate. Backend nie waliduje wartości, więc frontend wysyła tylko te. */
export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  nowe: "Nowe", zaakceptowane: "Zaakceptowane", w_trakcie: "W trakcie", zakonczone: "Zakończone", odrzucone: "Odrzucone",
};
export const label = (labels: Record<string, string>, value: string) => labels[value] ?? value;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ApplicationDraft {
  innovation_id: string; tester_type: string; institution_name: string; contact_person: string;
  contact_email: string; contact_phone: string; testing_scope: string; target_audience_count: string; notes: string;
}
export type ApplicationErrors = Partial<Record<keyof ApplicationDraft, string>>;
export const emptyApplication = (innovationId = ""): ApplicationDraft => ({
  innovation_id: innovationId, tester_type: "JST", institution_name: "", contact_person: "", contact_email: "",
  contact_phone: "", testing_scope: "pilotaz_3m", target_audience_count: "", notes: "",
});
export const APPLICATION_ORDER: (keyof ApplicationDraft)[] = [
  "innovation_id", "institution_name", "tester_type", "contact_person", "contact_email", "contact_phone",
  "testing_scope", "target_audience_count", "notes",
];

export function validateApplication(d: ApplicationDraft): ApplicationErrors {
  const e: ApplicationErrors = {};
  if (!d.innovation_id.trim()) e.innovation_id = "Wybierz innowację do przetestowania.";
  const name = d.institution_name.trim();
  if (name.length < 2 || name.length > 255) e.institution_name = "Nazwa instytucji: od 2 do 255 znaków.";
  const person = d.contact_person.trim();
  if (person.length < 2 || person.length > 255) e.contact_person = "Osoba koordynująca: od 2 do 255 znaków.";
  if (!EMAIL.test(d.contact_email.trim())) e.contact_email = "Podaj poprawny adres email do kontaktu.";
  if (d.contact_phone.trim().length > 50) e.contact_phone = "Telefon: maksymalnie 50 znaków.";
  if (!TESTER_TYPES.includes(d.tester_type as never)) e.tester_type = "Wybierz typ instytucji.";
  if (!(d.testing_scope in SCOPE_LABELS)) e.testing_scope = "Wybierz zakres testu.";
  const count = d.target_audience_count.trim();
  if (!/^\d+$/.test(count) || Number(count) < 1 || Number(count) > 1_000_000) e.target_audience_count = "Podaj liczbę uczestników — liczbę całkowitą od 1.";
  if (d.notes.length > 5000) e.notes = "Uwagi: maksymalnie 5000 znaków.";
  return e;
}
export function applicationPayload(d: ApplicationDraft) {
  return {
    innovation_id: d.innovation_id.trim(), tester_type: d.tester_type, institution_name: d.institution_name.trim(),
    contact_person: d.contact_person.trim(), contact_email: d.contact_email.trim(),
    contact_phone: d.contact_phone.trim() || null, testing_scope: d.testing_scope,
    target_audience_count: Number(d.target_audience_count.trim()), notes: d.notes.trim() || null,
  };
}

export interface FeedbackDraft {
  innovation_id: string; application_id: string; rating_usability: string; rating_effectiveness: string;
  rating_accessibility: string; pros: string; cons_and_barriers: string; suggested_improvements: string;
  would_recommend: string; author_name: string;
}
export type FeedbackErrors = Partial<Record<keyof FeedbackDraft, string>>;
export const emptyFeedback = (innovationId = "", applicationId = ""): FeedbackDraft => ({
  innovation_id: innovationId, application_id: applicationId, rating_usability: "", rating_effectiveness: "",
  rating_accessibility: "", pros: "", cons_and_barriers: "", suggested_improvements: "", would_recommend: "", author_name: "",
});
export const FEEDBACK_ORDER: (keyof FeedbackDraft)[] = [
  "innovation_id", "rating_usability", "rating_effectiveness", "rating_accessibility", "would_recommend",
  "pros", "cons_and_barriers", "suggested_improvements", "author_name", "application_id",
];
export const RATING_LABELS = {
  rating_usability: "Łatwość wdrożenia",
  rating_effectiveness: "Skuteczność dla odbiorców",
  rating_accessibility: "Dostępność (osoby z niepełnosprawnościami, seniorzy)",
} as const;

export function validateFeedback(d: FeedbackDraft): FeedbackErrors {
  const e: FeedbackErrors = {};
  if (!d.innovation_id.trim()) e.innovation_id = "Wybierz ocenianą innowację.";
  for (const key of Object.keys(RATING_LABELS) as (keyof typeof RATING_LABELS)[]) {
    if (!/^[1-5]$/.test(d[key])) e[key] = `${RATING_LABELS[key]}: wybierz ocenę od 1 do 5.`;
  }
  if (d.would_recommend !== "tak" && d.would_recommend !== "nie") e.would_recommend = "Zaznacz, czy polecasz rozwiązanie innym.";
  const author = d.author_name.trim();
  if (author.length < 2 || author.length > 255) e.author_name = "Podpis: od 2 do 255 znaków.";
  if (d.application_id.trim() && !isUuid(d.application_id.trim())) e.application_id = "Numer zgłoszenia testowego ma postać UUID, np. 1b2c…-…. Możesz zostawić pole puste.";
  for (const key of ["pros", "cons_and_barriers", "suggested_improvements"] as const) {
    if (d[key].length > 5000) e[key] = "Maksymalnie 5000 znaków.";
  }
  return e;
}
export function feedbackPayload(d: FeedbackDraft) {
  const text = (v: string) => v.trim() || null;
  return {
    innovation_id: d.innovation_id.trim(), application_id: d.application_id.trim() || null,
    rating_usability: Number(d.rating_usability), rating_effectiveness: Number(d.rating_effectiveness),
    rating_accessibility: Number(d.rating_accessibility), pros: text(d.pros),
    cons_and_barriers: text(d.cons_and_barriers), suggested_improvements: text(d.suggested_improvements),
    would_recommend: d.would_recommend === "tak", author_name: d.author_name.trim(),
  };
}

// ---------- parsery ----------
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, f: string): string => { if (typeof v !== "string") throw new Error(`Niepoprawne pole ${f}.`); return v; };
const optStr = (v: unknown, f: string): string | null => (v === null || v === undefined ? null : str(v, f));
const int = (v: unknown, f: string): number => { if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new Error(`Niepoprawne pole ${f}.`); return v; };
const num = (v: unknown, f: string): number => { if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Niepoprawne pole ${f}.`); return v; };
const bool = (v: unknown, f: string): boolean => { if (typeof v !== "boolean") throw new Error(`Niepoprawne pole ${f}.`); return v; };

export interface Application {
  id: string; innovation_id: string; tester_type: string; institution_name: string; contact_person: string;
  contact_email: string; contact_phone: string | null; testing_scope: string; target_audience_count: number;
  status: string; notes: string | null; created_at: string | null; updated_at: string | null;
}
export function parseApplication(v: unknown): Application {
  if (!isRecord(v)) throw new Error("Niepoprawne zgłoszenie testowe.");
  return {
    id: str(v.id, "id"), innovation_id: str(v.innovation_id, "innovation_id"), tester_type: str(v.tester_type, "tester_type"),
    institution_name: str(v.institution_name, "institution_name"), contact_person: str(v.contact_person, "contact_person"),
    contact_email: str(v.contact_email, "contact_email"), contact_phone: optStr(v.contact_phone, "contact_phone"),
    testing_scope: str(v.testing_scope, "testing_scope"), target_audience_count: int(v.target_audience_count, "target_audience_count"),
    status: str(v.status, "status"), notes: optStr(v.notes, "notes"),
    created_at: optStr(v.created_at, "created_at"), updated_at: optStr(v.updated_at, "updated_at"),
  };
}
export function parseApplications(v: unknown): Application[] {
  if (!Array.isArray(v)) throw new Error("Oczekiwano listy zgłoszeń testowych.");
  return v.map(parseApplication);
}

export interface Feedback {
  id: string; innovation_id: string; application_id: string | null; rating_usability: number; rating_effectiveness: number;
  rating_accessibility: number; average_score: number; pros: string | null; cons_and_barriers: string | null;
  suggested_improvements: string | null; would_recommend: boolean; author_name: string; created_at: string | null;
}
export function parseFeedback(v: unknown): Feedback {
  if (!isRecord(v)) throw new Error("Niepoprawna opinia.");
  return {
    id: str(v.id, "id"), innovation_id: str(v.innovation_id, "innovation_id"), application_id: optStr(v.application_id, "application_id"),
    rating_usability: int(v.rating_usability, "rating_usability"), rating_effectiveness: int(v.rating_effectiveness, "rating_effectiveness"),
    rating_accessibility: int(v.rating_accessibility, "rating_accessibility"), average_score: num(v.average_score, "average_score"),
    pros: optStr(v.pros, "pros"), cons_and_barriers: optStr(v.cons_and_barriers, "cons_and_barriers"),
    suggested_improvements: optStr(v.suggested_improvements, "suggested_improvements"),
    would_recommend: bool(v.would_recommend, "would_recommend"), author_name: str(v.author_name, "author_name"),
    created_at: optStr(v.created_at, "created_at"),
  };
}

export interface FeedbackSummary {
  innovation_id: string; total: number; usability: number; effectiveness: number; accessibility: number;
  overall: number; recommend_pct: number; recent: Feedback[];
}
export function parseFeedbackSummary(v: unknown): FeedbackSummary {
  if (!isRecord(v)) throw new Error("Niepoprawne podsumowanie ocen.");
  if (!Array.isArray(v.recent_reviews)) throw new Error("Niepoprawne pole recent_reviews.");
  return {
    innovation_id: str(v.innovation_id, "innovation_id"), total: int(v.total_reviews, "total_reviews"),
    usability: num(v.avg_usability, "avg_usability"), effectiveness: num(v.avg_effectiveness, "avg_effectiveness"),
    accessibility: num(v.avg_accessibility, "avg_accessibility"), overall: num(v.overall_rating, "overall_rating"),
    recommend_pct: num(v.recommendation_percentage, "recommendation_percentage"), recent: v.recent_reviews.map(parseFeedback),
  };
}

export interface GlobalSummary {
  applications: number; active: number; completed: number; feedbacks: number; average: number;
  top: { innovation_id: string; average_score: number; review_count: number }[]; by_status: Record<string, number>;
}
export function parseGlobalSummary(v: unknown): GlobalSummary {
  if (!isRecord(v) || !Array.isArray(v.top_rated_innovations) || !isRecord(v.applications_by_status)) throw new Error("Niepoprawne podsumowanie testów.");
  return {
    applications: int(v.total_applications, "total_applications"), active: int(v.active_pilots, "active_pilots"),
    completed: int(v.completed_pilots, "completed_pilots"), feedbacks: int(v.total_feedbacks, "total_feedbacks"),
    average: num(v.overall_avg_rating, "overall_avg_rating"),
    top: v.top_rated_innovations.map((t) => {
      if (!isRecord(t)) throw new Error("Niepoprawny wiersz rankingu.");
      return { innovation_id: str(t.innovation_id, "innovation_id"), average_score: num(t.average_score, "average_score"), review_count: int(t.review_count, "review_count") };
    }),
    by_status: Object.fromEntries(Object.entries(v.applications_by_status).map(([k, n]) => [k, int(n, "applications_by_status")])),
  };
}

/**
 * Bez ocen backend zwraca średnie 0 i rekomendację 100% — to nie są wyniki.
 * Widok pokazuje liczby tylko wtedy, gdy istnieje co najmniej jedna opinia.
 */
export function ratingLines(s: FeedbackSummary): string[] | null {
  if (s.total === 0) return null;
  const f = (n: number) => n.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  return [
    `Ocena ogólna: ${f(s.overall)} / 5 (liczba opinii: ${s.total})`,
    `${RATING_LABELS.rating_usability}: ${f(s.usability)} / 5`,
    `${RATING_LABELS.rating_effectiveness}: ${f(s.effectiveness)} / 5`,
    `${RATING_LABELS.rating_accessibility}: ${f(s.accessibility)} / 5`,
    `Poleca innym: ${s.recommend_pct.toLocaleString("pl-PL")}% opinii`,
  ];
}
