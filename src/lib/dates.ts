import { DomainError } from "./errors";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Today's date in Harare as YYYY-MM-DD. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare" }).format(new Date());
}

/** "2026-11-23" -> "23 Nov 2026" */
export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return "–";
  const s = typeof iso === "string" ? iso : new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare" }).format(iso);
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "–";
  const date = typeof d === "string" ? new Date(d) : d;
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Harare", hour: "2-digit", minute: "2-digit" }).format(date);
  return `${fmtDate(date)}, ${time}`;
}

export function parseIsoDate(input: unknown, field = "Date"): string {
  const s = String(input ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + "T00:00:00Z"))) {
    throw new DomainError(`${field} must be a valid date (YYYY-MM-DD).`);
  }
  return s;
}

export function yearMonth(iso: string): string {
  return iso.slice(0, 7);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso + "T00:00:00Z") - Date.parse(fromIso + "T00:00:00Z")) / 86400000);
}

export function fmtYearMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}
