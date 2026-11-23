import { DomainError } from "./errors";

export const CURRENCIES = ["USD", "ZAR", "ZWG"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_LABEL: Record<string, string> = {
  USD: "USD, US dollar",
  ZAR: "ZAR, South African rand",
  ZWG: "ZWG, Zimbabwe Gold (ZiG)",
};

/** Parse a user-entered amount ("1,250.5") into integer minor units (125050). */
export function parseAmount(input: unknown, field = "Amount"): number {
  const raw = String(input ?? "").replace(/[,\s]/g, "").trim();
  if (raw === "") throw new DomainError(`${field} is required. Enter a number such as 1,250.00.`);
  if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) {
    throw new DomainError(`${field} must be a number with at most 2 decimals, for example 1,250.00.`);
  }
  const negative = raw.startsWith("-");
  const [whole, frac = ""] = raw.replace("-", "").split(".");
  const minor = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(minor)) throw new DomainError(`${field} is too large.`);
  return negative ? -minor : minor;
}

export function parsePositiveAmount(input: unknown, field = "Amount"): number {
  const v = parseAmount(input, field);
  if (v <= 0) throw new DomainError(`${field} must be greater than 0.00.`);
  return v;
}

/** 125050 -> "1,250.50". Negatives in parentheses, as the brand manual requires for tables. */
export function formatMinor(minor: number, opts: { parens?: boolean } = { parens: true }): string {
  const abs = Math.abs(minor);
  const s = `${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
  if (minor < 0) return opts.parens === false ? `−${s}` : `(${s})`;
  return s;
}

/** Input-field value: no thousands separators. */
export function minorToInput(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Summary form: USD 4.2M, USD 12.5K. */
export function formatCompact(minor: number): string {
  const v = minor / 100;
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${sign}${(abs / 1000).toFixed(1)}K`;
  return formatMinor(minor, { parens: false });
}

/** Amount in words for receipts: "One thousand two hundred and fifty US dollars and 50 cents". */
export function amountInWords(minor: number, currency: string): string {
  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const under1000 = (n: number): string => {
    const h = Math.floor(n / 100), r = n % 100;
    const parts: string[] = [];
    if (h) parts.push(`${ones[h]} hundred`);
    if (r) {
      const t = r < 20 ? ones[r] : `${tens[Math.floor(r / 10)]}${r % 10 ? "-" + ones[r % 10] : ""}`;
      parts.push(h ? `and ${t}` : t);
    }
    return parts.join(" ");
  };
  const words = (n: number): string => {
    if (n === 0) return "zero";
    const scales: [number, string][] = [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];
    const out: string[] = [];
    let rest = n;
    for (const [v, name] of scales) {
      if (rest >= v) { out.push(`${under1000(Math.floor(rest / v))} ${name}`); rest %= v; }
    }
    if (rest) out.push(rest < 100 && out.length ? `and ${under1000(rest)}` : under1000(rest));
    return out.join(" ");
  };
  const names: Record<string, [string, string]> = { USD: ["US dollars", "cents"], ZAR: ["rand", "cents"], ZWG: ["Zimbabwe Gold", "cents"] };
  const [major, minorName] = names[currency] ?? [currency, "cents"];
  const w = words(Math.floor(Math.abs(minor) / 100));
  const c = Math.abs(minor) % 100;
  const s = `${w} ${major}${c ? ` and ${c} ${minorName}` : " only"}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** VAT on a net amount in minor units, rate in basis points, rounded half up. */
export function vatOn(netMinor: number, rateBp: number): number {
  return Math.round((netMinor * rateBp) / 10000);
}

/** quantity is a decimal string, unitMinor integer. Returns integer minor. */
export function lineTotal(quantity: string, unitMinor: number): number {
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0) throw new DomainError("Quantity must be a number greater than 0.");
  return Math.round(q * unitMinor);
}
