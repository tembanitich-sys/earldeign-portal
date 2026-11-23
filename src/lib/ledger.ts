import { and, asc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { Executor } from "@/db";
import { ledgerEntries, periods, type EntryType } from "@/db/schema";
import { DomainError } from "./errors";
import { fmtYearMonth, yearMonth } from "./dates";

export const ENTRY_LABEL: Record<EntryType, string> = {
  opening_balance: "Historical",
  drawdown: "Drawdown",
  income_applied_offset: "Income applied",
  advance_refund: "Change returned",
  receipt: "Receipt",
  conversion_out: "Conversion out",
  conversion_in: "Conversion in",
  reversal: "Reversal",
};

export async function isPeriodClosed(db: Executor, jvId: string, dateIso: string): Promise<boolean> {
  const [row] = await db.select({ ym: periods.yearMonth }).from(periods)
    .where(and(eq(periods.jvId, jvId), eq(periods.yearMonth, yearMonth(dateIso))));
  return Boolean(row);
}

export type PostInput = {
  jvId: string;
  entryDate: string;
  currency: string;
  type: EntryType;
  loanDelta?: number;
  incomeDelta?: number;
  description: string;
  reference: string;
  sourceType: string;
  sourceId: string;
  createdById: string;
  changeRequestId?: string | null;
  reversesEntryId?: number | null;
};

/**
 * The only way money enters the ledger. Posting into a closed period is rejected unless the
 * posting comes from an authorised change request, in which case it is flagged as a prior period adjustment.
 */
export async function post(db: Executor, input: PostInput) {
  const closed = await isPeriodClosed(db, input.jvId, input.entryDate);
  if (closed && !input.changeRequestId) {
    throw new DomainError(`${fmtYearMonth(yearMonth(input.entryDate))} is closed. Use a change request to adjust a closed period.`);
  }
  const [row] = await db.insert(ledgerEntries).values({
    jvId: input.jvId,
    entryDate: input.entryDate,
    currency: input.currency,
    type: input.type,
    loanDelta: input.loanDelta ?? 0,
    incomeDelta: input.incomeDelta ?? 0,
    description: input.description,
    reference: input.reference,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    createdById: input.createdById,
    changeRequestId: input.changeRequestId ?? null,
    reversesEntryId: input.reversesEntryId ?? null,
    priorPeriodAdjustment: closed,
  }).returning();
  return row;
}

/** Entries for a source document that are still in force (not reversals, not yet reversed). */
export async function activeEntriesFor(db: Executor, sourceType: string, sourceId: string) {
  const reversed = db.select({ id: ledgerEntries.reversesEntryId }).from(ledgerEntries)
    .where(and(eq(ledgerEntries.sourceType, sourceType), eq(ledgerEntries.sourceId, sourceId), sql`${ledgerEntries.reversesEntryId} is not null`));
  return db.select().from(ledgerEntries).where(and(
    eq(ledgerEntries.sourceType, sourceType),
    eq(ledgerEntries.sourceId, sourceId),
    isNull(ledgerEntries.reversesEntryId),
    notInArray(ledgerEntries.id, reversed as never),
  )).orderBy(asc(ledgerEntries.id));
}

/** Reverse every active entry of a source document. Returns the reversal rows. */
export async function reverseAllFor(db: Executor, opts: {
  sourceType: string; sourceId: string; createdById: string; changeRequestId: string; reason: string; entryDate?: string;
}) {
  const active = await activeEntriesFor(db, opts.sourceType, opts.sourceId);
  const out = [];
  for (const e of active) {
    out.push(await post(db, {
      jvId: e.jvId,
      entryDate: opts.entryDate ?? e.entryDate,
      currency: e.currency,
      type: "reversal",
      loanDelta: -e.loanDelta,
      incomeDelta: -e.incomeDelta,
      description: `Reversal of ${e.reference}: ${opts.reason}`,
      reference: e.reference,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      createdById: opts.createdById,
      changeRequestId: opts.changeRequestId,
      reversesEntryId: e.id,
    }));
  }
  return out;
}

export type Balance = { currency: string; loan: number; incomeHeld: number; net: number };

/** Balances per currency. Currencies are never combined. */
export async function balances(db: Executor, jvId: string, currencies: string[], asOf?: string): Promise<Balance[]> {
  const conds = [eq(ledgerEntries.jvId, jvId)];
  if (asOf) conds.push(sql`${ledgerEntries.entryDate} <= ${asOf}`);
  const rows = await db.select({
    currency: ledgerEntries.currency,
    loan: sql<string>`coalesce(sum(${ledgerEntries.loanDelta}), 0)`,
    income: sql<string>`coalesce(sum(${ledgerEntries.incomeDelta}), 0)`,
  }).from(ledgerEntries).where(and(...conds)).groupBy(ledgerEntries.currency);
  const map = new Map(rows.map((r) => [r.currency, r]));
  const all = [...new Set([...currencies, ...rows.map((r) => r.currency)])];
  return all.map((c) => {
    const r = map.get(c);
    const loan = Number(r?.loan ?? 0);
    const incomeHeld = Number(r?.income ?? 0);
    return { currency: c, loan, incomeHeld, net: loan - incomeHeld };
  });
}

export async function incomeHeld(db: Executor, jvId: string, currency: string): Promise<number> {
  const [r] = await db.select({ v: sql<string>`coalesce(sum(${ledgerEntries.incomeDelta}), 0)` })
    .from(ledgerEntries).where(and(eq(ledgerEntries.jvId, jvId), eq(ledgerEntries.currency, currency)));
  return Number(r?.v ?? 0);
}

/** Loan statement lines for one currency with running balance. */
export async function statement(db: Executor, jvId: string, currency: string, from?: string, to?: string) {
  const all = await db.select().from(ledgerEntries)
    .where(and(eq(ledgerEntries.jvId, jvId), eq(ledgerEntries.currency, currency)))
    .orderBy(asc(ledgerEntries.entryDate), asc(ledgerEntries.id));
  let loan = 0;
  let income = 0;
  let openingLoan = 0;
  let openingIncome = 0;
  const lines = [];
  for (const e of all) {
    if (from && e.entryDate < from) {
      openingLoan += e.loanDelta;
      openingIncome += e.incomeDelta;
      loan = openingLoan;
      income = openingIncome;
      continue;
    }
    if (to && e.entryDate > to) break;
    loan += e.loanDelta;
    income += e.incomeDelta;
    lines.push({ ...e, loanBalance: loan, incomeBalance: income });
  }
  return { openingLoan, openingIncome, lines, closingLoan: loan, closingIncome: income };
}

export async function entriesForSources(db: Executor, sourceType: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(ledgerEntries).where(and(eq(ledgerEntries.sourceType, sourceType), inArray(ledgerEntries.sourceId, ids)));
}
