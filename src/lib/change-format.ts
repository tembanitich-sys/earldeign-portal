import type { Ctx } from "./access";
import { clientsOf, projectsOf, categoriesOf, supplierInvoicesOf } from "./lookups";
import { fmtDate } from "./dates";
import { formatMinor } from "./money";
import { RECEIPT_METHODS } from "@/services/income";

/** Human-readable rendering of change-request values. */
export async function formatter(ctx: Ctx) {
  const [projects, cats, clients, sis] = await Promise.all([projectsOf(ctx, false), categoriesOf(ctx, false), clientsOf(ctx), supplierInvoicesOf(ctx)]);
  const name = (list: { id: string; name: string }[], id: unknown) => list.find((x) => x.id === id)?.name ?? (id ? String(id) : "None");
  return (field: string, v: unknown, currency?: string): string => {
    if (v === "" || v === null || v === undefined) return "None";
    switch (field) {
      case "amount": return `${currency ?? ""} ${formatMinor(Number(v))}`.trim();
      case "date": case "issueDate": case "dueDate": case "invoiceDate": return fmtDate(String(v));
      case "projectId": return name(projects, v);
      case "categoryId": return name(cats, v);
      case "clientId": return name(clients, v);
      case "supplierInvoiceId": { const s = sis.find((x) => x.id === v); return s ? `${s.supplier} ${s.supplierInvoiceNo}` : String(v); }
      case "payFrom": return v === "jv_income" ? "JV income held" : ctx.jv.fundingPartner;
      case "method": return RECEIPT_METHODS[String(v)] ?? String(v);
      case "lines": return (v as { projectId: string; description: string; amount: number }[]).map((l) => `${name(projects, l.projectId)}: ${l.description}, ${formatMinor(l.amount)}`).join("\n");
      default: return String(v);
    }
  };
}
