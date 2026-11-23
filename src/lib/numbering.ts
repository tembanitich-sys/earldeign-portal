import { sql } from "drizzle-orm";
import type { Executor } from "@/db";
import { sequences } from "@/db/schema";

export type DocType = "REQ" | "INV" | "IR" | "RCT" | "CN" | "CR" | "FX" | "EXT";

/** Allocates the next number for a JV, e.g. BT-REQ-2026-0001. Safe under concurrency (row lock via upsert). */
export async function nextNumber(db: Executor, jv: { id: string; shortCode: string }, docType: DocType, dateIso: string): Promise<string> {
  const year = Number(dateIso.slice(0, 4));
  const [row] = await db
    .insert(sequences)
    .values({ jvId: jv.id, docType, year, next: 2 })
    .onConflictDoUpdate({
      target: [sequences.jvId, sequences.docType, sequences.year],
      set: { next: sql`${sequences.next} + 1` },
    })
    .returning({ next: sequences.next });
  const n = row.next - 1;
  return `${jv.shortCode}-${docType}-${year}-${String(n).padStart(4, "0")}`;
}
