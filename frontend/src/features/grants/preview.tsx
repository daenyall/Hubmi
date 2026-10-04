"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/status-message";
import { formatDate } from "@/features/submissions/model";
import {
  APPLICANT_TYPE_LABELS, APPLICATION_STATUS_LABELS, CALL_STATUS_LABELS, DECLARATIONS, TEXT_SECTIONS,
  exportFileText, formatPln, label, type GrantExport,
} from "./model";

const s = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : {});

/** Wyjaśnienie stanu naboru — jedno źródło dla formularza, podglądu i listy naborów. */
export function CallStatusNotice({ status }: { status: string | null }) {
  if (status === "otwarty") return <StatusMessage><strong>Nabór otwarty.</strong> Złożony wniosek trafia do oceny ROPS w tym naborze.</StatusMessage>;
  if (status === "zamkniety") return <StatusMessage error><strong>Nabór zamknięty.</strong> Nie można rozpocząć ani złożyć wniosku. Zapisane wersje robocze możesz przeglądać i eksportować.</StatusMessage>;
  return <StatusMessage><strong>Nabór demonstracyjny.</strong> To ćwiczenie na wzorze formularza ROPS. Złożenie zapisuje wniosek w HubMI do wglądu ROPS — <strong>nie jest zgłoszeniem w oficjalnym konkursie</strong> i nie daje prawa do grantu.</StatusMessage>;
}

function Applicant({ type, data }: { type: string; data: Record<string, unknown> }) {
  const a = rec(data.address);
  const address = [s(a.street), [s(a.postal_code), s(a.city)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const rows: [string, string][] = type === "osoba_fizyczna"
    ? [["Imię i nazwisko", `${s(data.first_name)} ${s(data.last_name)}`.trim()], ["Email", s(data.email)], ["Telefon", s(data.phone)], ["Adres", address]]
    : type === "podmiot"
      ? [["Nazwa", s(data.organization_name)], ["NIP", s(data.nip)], ["REGON", s(data.regon)], ["KRS", s(data.krs)], ["Reprezentant", s(rec(data.authorized_representative).name)], ["Email", s(data.email)], ["Telefon", s(data.phone)], ["Siedziba", address]]
      : [["Partnerzy", (Array.isArray(data.partners) ? data.partners : []).map((p) => s(rec(p).name) || s(p)).filter(Boolean).join(", ")], ["Reprezentant", s(rec(data.representative).name)], ["Email reprezentanta", s(rec(data.representative).email)]];
  return <dl className="grid gap-3 sm:grid-cols-2 [&>div]:min-w-0">
    <div className="sm:col-span-2"><dt className="font-semibold">Typ wnioskodawcy</dt><dd>{label(APPLICANT_TYPE_LABELS, type)}</dd></div>
    {rows.map(([k, v]) => <div key={k}><dt className="font-semibold">{k}</dt><dd className="[overflow-wrap:anywhere]">{v || "nie podano"}</dd></div>)}
  </dl>;
}

function Plan({ title, rows, months }: { title: string; rows: unknown[]; months: string }) {
  return <div className="space-y-2">
    <h4 className="font-semibold">{title} <span className="font-normal text-muted-foreground">({months})</span></h4>
    {rows.length === 0 ? <p className="text-muted-foreground">Brak pozycji.</p> : <div className="overflow-x-auto rounded-sm" tabIndex={0} role="region" aria-label={`${title} — tabela, przewijana w poziomie`}><table className="w-full min-w-[28rem] border-collapse text-left text-sm">
      <thead><tr className="border-b border-border"><th scope="col" className="py-2 pr-3">Działanie</th><th scope="col" className="py-2 pr-3">Termin</th><th scope="col" className="py-2 text-right">Koszt</th></tr></thead>
      <tbody>{rows.map((r, i) => { const o = rec(r); return <tr key={i} className="border-b border-border">
        <td className="py-2 pr-3">{o.phase ? `[${s(o.phase)}] ` : ""}{s(o.action_name) || "—"}</td><td className="py-2 pr-3">{s(o.schedule) || "—"}</td><td className="py-2 text-right">{formatPln(Number(o.cost) || 0)}</td>
      </tr>; })}</tbody>
    </table></div>}
  </div>;
}

/** Podgląd zapisanej wersji (z eksportu backendu), druk i pobranie tekstu wzoru. */
export function GrantPreview({ exp, callStatus, maxPrep, maxTest }: { exp: GrantExport; callStatus: string | null; maxPrep?: number; maxTest?: number }) {
  const app = exp.application;
  function download() {
    const blob = new Blob([exportFileText(exp, callStatus)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `wniosek-${exp.application_id.slice(0, 8)}.txt`;
    document.body.append(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
  return <article aria-labelledby="preview-title" className="space-y-6">
    <div className="flex flex-wrap gap-3 print:hidden">
      <Button type="button" onClick={() => window.print()} className="h-auto min-h-11 max-w-full whitespace-normal px-[16px] py-2">Drukuj lub zapisz jako PDF</Button>
      <Button type="button" variant="outline" onClick={download} className="h-auto min-h-11 max-w-full whitespace-normal px-[16px] py-2">Pobierz tekst wniosku (.txt)</Button>
    </div>
    <CallStatusNotice status={callStatus} />
    <header className="space-y-2">
      <h2 id="preview-title" className="text-2xl font-semibold">{app.title || "(bez tytułu)"}</h2>
      <p className="text-sm">Nabór: {exp.call_name}</p>
      <p className="text-sm">Wzór: {exp.template_name}, wersja {exp.template_version} · Stan naboru: {label(CALL_STATUS_LABELS, callStatus ?? "")}</p>
      <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary" className="h-auto min-h-7 whitespace-normal">{label(APPLICATION_STATUS_LABELS, exp.status)}</Badge>
        <span className="text-sm text-muted-foreground">{app.submitted_at ? <>Złożono <time dateTime={app.submitted_at}>{formatDate(app.submitted_at)}</time></> : "Wersja robocza — jeszcze niezłożona"}</span></div>
    </header>
    <section className="space-y-2"><h3 className="text-lg font-semibold">2. Dane pomysłodawcy</h3><Applicant type={app.applicant_type} data={app.applicant_data} /></section>
    {TEXT_SECTIONS.filter(([k]) => k !== "project_team").map(([k, name]) => <section key={k} className="space-y-1"><h3 className="text-lg font-semibold">{name}</h3><p className="whitespace-pre-wrap leading-relaxed">{app[k] || "Nie uzupełniono."}</p></section>)}
    <section className="space-y-4"><h3 className="text-lg font-semibold">9. Plan działania i kosztorys</h3>
      <Plan title="A. Okres przygotowawczy" rows={app.action_plan.prep_period} months={maxPrep ? `maks. ${maxPrep} mies.` : "limit wg naboru"} />
      <Plan title="B. Okres testowania" rows={app.action_plan.test_period} months={maxTest ? `maks. ${maxTest} mies.` : "limit wg naboru"} />
    </section>
    <section className="space-y-1"><h3 className="text-lg font-semibold">10. Wnioskowana kwota</h3>
      <p>Wnioskowana kwota: <strong>{formatPln(app.grant_amount)}</strong> · Suma kosztów planu: {formatPln(app.total_costs_calculated)}</p>
      <p className={app.is_budget_balanced ? "" : "font-semibold text-red-900"}>{app.is_budget_balanced ? "Kosztorys zgodny z wnioskowaną kwotą." : `Kosztorys niezgodny — różnica ${formatPln(Math.abs(app.total_costs_calculated - app.grant_amount))}.`}</p>
    </section>
    <section className="space-y-1"><h3 className="text-lg font-semibold">11. Zespół projektowy</h3><p className="whitespace-pre-wrap leading-relaxed">{app.project_team || "Nie uzupełniono."}</p></section>
    <section className="space-y-2"><h3 className="text-lg font-semibold">12. Oświadczenia</h3>
      <ul className="space-y-1">{DECLARATIONS.map(([k, text]) => <li key={k}>{app.declarations[k] === true ? "Potwierdzone: " : "Niepotwierdzone: "}{text}</li>)}</ul>
    </section>
    <details className="rounded-xl border border-border p-[16px] print:hidden">
      <summary className="min-h-11 cursor-pointer rounded-sm py-2 font-semibold text-primary">Tekst dokumentu w układzie wzoru (z usługi)</summary>
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap [overflow-wrap:anywhere] text-sm">{exportFileText(exp, callStatus)}</pre>
    </details>
  </article>;
}
