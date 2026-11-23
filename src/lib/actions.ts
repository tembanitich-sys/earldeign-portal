import "server-only";
import { DomainError } from "./errors";
import { flushEmails } from "./notify";
import type { FormState } from "@/components/forms";

/** Converts a thrown error into form state. Domain errors are shown verbatim; anything else is logged. */
export function fail(e: unknown): FormState {
  if (e instanceof DomainError) return { error: e.message };
  const msg = (e as { cause?: { code?: string } })?.cause?.code === "23505" ? "That record already exists (duplicate number or name)." : null;
  if (msg) return { error: msg };
  console.error(e);
  return { error: "Something went wrong on the server. Nothing was saved. Try again, and if it keeps happening contact the Super Admin." };
}

export async function afterWrite() {
  try { await flushEmails(); } catch (e) { console.error("[mail] flush failed", e); }
}

export const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const all = (fd: FormData, k: string) => fd.getAll(k).map((v) => String(v));
