/**
 * SMS sender. Gateway-agnostic: the Econet gateway (or any HTTP SMS API) is configured with environment
 * variables, so switching provider or changing the API shape needs no code change.
 *
 * SMS_DRIVER      off (default) | log | econet | http
 *
 * econet: Econet Zimbabwe SMS HTTP API (Aggregator V4). Needs SMS_API_KEY and SMS_SENDER_ID;
 *         SMS_API_BASE defaults to https://mobilemessaging.econet.co.zw.
 * http:   any other HTTP gateway, described by the variables below.
 * SMS_SENDER_ID   approved sender name, at most 11 letters/digits, e.g. EarldeignJV
 * SMS_API_URL     gateway endpoint
 * SMS_API_METHOD  POST (default) or GET
 * SMS_AUTH_HEADER full Authorization header value, e.g. "Bearer abc" or "Basic dXNlcjpwYXNz"
 * SMS_BODY        request template. Placeholders: {{to}} (+263...), {{to_local}} (263...), {{to_national}} (07...),
 *                 {{message}}, {{sender}}. JSON by default; SMS_CONTENT_TYPE overrides (e.g. application/x-www-form-urlencoded).
 *                 For GET, placeholders in SMS_API_URL are filled instead.
 * SMS_SUCCESS_MATCH optional text the response must contain to count as sent.
 */

export type SmsResult = { ok: boolean; detail: string };

const GSM_MAX = 160;

/** Normalise a Zimbabwean or international number to E.164 (+263771234567). Returns null when invalid. */
export function normalisePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.replace(/[\s()-]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (/^0\d{9}$/.test(s)) s = "+263" + s.slice(1);
  if (/^263\d{9}$/.test(s)) s = "+" + s;
  return /^\+\d{9,15}$/.test(s) ? s : null;
}

/** Short, plain SMS: fits one 160-character message where possible. */
export function smsText(title: string, url?: string | null): string {
  const tail = url ? ` ${url}` : "";
  const room = GSM_MAX - tail.length;
  const t = title.replace(/[–—]/g, "-").replace(/[^\x20-\x7E]/g, "");
  return (t.length > room ? t.slice(0, Math.max(20, room - 3)) + "..." : t) + tail;
}

function fill(template: string, vars: Record<string, string>, encode: (v: string) => string) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => encode(vars[k] ?? ""));
}

/**
 * Reads an Econet response (JSON or XML). Success is error-code 000 with no failed messages.
 * Error codes per the API document: -101 unknown, 000 success, 001 required, 002 invalid, 003 failed, 004 duplicate.
 */
export function parseEconetResponse(status: number, body: string): SmsResult {
  const text = body.trim();
  let code: string | null = null;
  let description = "";
  let failed = 0;
  try {
    const j = JSON.parse(text);
    code = String(j?.status?.["error-code"] ?? "");
    description = String(j?.status?.["error-description"] ?? j?.status?.["error-status"] ?? "");
    const details = Array.isArray(j?.["sms-response-details"]) ? j["sms-response-details"] : [j?.["sms-response-details"]].filter(Boolean);
    for (const d of details) for (const f of d?.["failed-sms-details"] ?? []) failed += Number(f?.count ?? 0) || 0;
  } catch {
    code = text.match(/<error-code>\s*([^<\s]*)\s*<\/error-code>/)?.[1] ?? null;
    description = text.match(/<error-description>([^<]*)<\/error-description>/)?.[1] ?? text.match(/<error-status>([^<]*)<\/error-status>/)?.[1] ?? "";
    failed = Number(text.match(/<failed-sms-details>\s*<count>\s*(\d+)/)?.[1] ?? 0);
  }
  const ok = status >= 200 && status < 300 && code === "000" && failed === 0;
  const names: Record<string, string> = { "-101": "unknown", "000": "success", "001": "required field missing", "002": "invalid value", "003": "failed", "004": "duplicate" };
  return { ok, detail: `HTTP ${status}, code ${code ?? "none"} (${names[code ?? ""] ?? "unrecognised"})${description ? `: ${description}` : ""}${failed ? `, ${failed} failed` : ""}` };
}

async function sendEconet(e164: string, message: string, clientId?: string): Promise<SmsResult> {
  const key = process.env.SMS_API_KEY;
  if (!key) return { ok: false, detail: "SMS_API_KEY is not set" };
  const base = (process.env.SMS_API_BASE ?? "https://mobilemessaging.econet.co.zw").replace(/\/$/, "");
  const q = new URLSearchParams({ apikey: key, mobiles: e164.slice(1), sms: message });
  if (process.env.SMS_SENDER_ID) q.set("senderid", process.env.SMS_SENDER_ID);
  if (clientId) q.set("client-sms-ids", clientId.replace(/[^A-Za-z0-9]/g, "").slice(0, 32));
  try {
    const res = await fetch(`${base}/client/api/sendmessage?${q.toString()}`, { method: "GET", signal: AbortSignal.timeout(15_000) });
    const r = parseEconetResponse(res.status, await res.text());
    if (!r.ok) console.error(`[sms:econet] not sent to ${e164}: ${r.detail}`);
    return r;
  } catch (e) {
    console.error("[sms:econet] request failed", (e as Error).message);
    return { ok: false, detail: (e as Error).message };
  }
}

export async function sendSms(to: string, message: string, clientId?: string): Promise<SmsResult> {
  const driver = process.env.SMS_DRIVER ?? "off";
  if (driver === "off") return { ok: false, detail: "SMS disabled" };
  const e164 = normalisePhone(to);
  if (!e164) return { ok: false, detail: `Invalid number ${to}` };
  if (driver === "log") {
    if (process.env.NODE_ENV !== "test") console.info(`[sms:log] to=${e164} msg=${message}`);
    return { ok: true, detail: "logged" };
  }
  if (driver === "econet") return sendEconet(e164, message, clientId);
  const url = process.env.SMS_API_URL;
  if (!url) return { ok: false, detail: "SMS_API_URL is not set" };
  const vars = {
    to: e164, to_local: e164.slice(1), to_national: e164.startsWith("+263") ? "0" + e164.slice(4) : e164,
    message, sender: process.env.SMS_SENDER_ID ?? "",
  };
  const method = (process.env.SMS_API_METHOD ?? "POST").toUpperCase();
  const contentType = process.env.SMS_CONTENT_TYPE ?? "application/json";
  const headers: Record<string, string> = {};
  if (process.env.SMS_AUTH_HEADER) headers.Authorization = process.env.SMS_AUTH_HEADER;
  try {
    let res: Response;
    if (method === "GET") {
      res = await fetch(fill(url, vars, encodeURIComponent), { method, headers, signal: AbortSignal.timeout(10_000) });
    } else {
      const template = process.env.SMS_BODY ?? '{"to":"{{to}}","from":"{{sender}}","message":"{{message}}"}';
      const enc = contentType.includes("json") ? (v: string) => JSON.stringify(v).slice(1, -1) : encodeURIComponent;
      headers["Content-Type"] = contentType;
      res = await fetch(fill(url, vars, encodeURIComponent), { method, headers, body: fill(template, vars, enc), signal: AbortSignal.timeout(10_000) });
    }
    const text = (await res.text()).slice(0, 300);
    const match = process.env.SMS_SUCCESS_MATCH;
    const ok = res.ok && (!match || text.includes(match));
    if (!ok) console.error(`[sms] gateway rejected: ${res.status} ${text}`);
    return { ok, detail: `${res.status} ${text}` };
  } catch (e) {
    console.error("[sms] send failed", e);
    return { ok: false, detail: (e as Error).message };
  }
}
