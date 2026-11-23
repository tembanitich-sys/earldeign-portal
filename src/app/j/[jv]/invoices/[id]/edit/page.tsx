import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { guard, requireJv } from "@/lib/session";
import { db } from "@/db";
import { invoiceLines } from "@/db/schema";

import { clientsOf, projectsOf } from "@/lib/lookups";
import { getInvoice } from "@/services/income";
import { InvoiceForm } from "@/components/invoice-form";
import { PageHead } from "@/components/ui";

export const metadata = { title: "Edit draft invoice" };

export default async function EditInvoice({ params }: { params: Promise<{ jv: string; id: string }> }) {
  const { jv, id } = await params;
  const ctx = await requireJv(jv);
  guard(ctx, "issue_invoice");
  const inv = await getInvoice(db, ctx, id).catch(() => null);
  if (!inv) notFound();
  if (inv.status !== "draft") redirect(`/j/${jv}/invoices/${id}`);
  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(asc(invoiceLines.position));
  return (<><PageHead title={`Edit ${inv.number}`} crumbs={<Link href={`/j/${jv}/invoices/${id}`}>{inv.number}</Link>} /><InvoiceForm ctx={ctx} clients={await clientsOf(ctx)} projects={await projectsOf(ctx)} inv={inv} lines={lines} /></>);
}
