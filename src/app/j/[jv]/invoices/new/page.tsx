import Link from "next/link";
import { guard, requireJv } from "@/lib/session";
import { db } from "@/db";

import { clientsOf, projectsOf } from "@/lib/lookups";
import { getInvoiceRequest } from "@/services/income";
import { InvoiceForm } from "@/components/invoice-form";
import { Notice, PageHead } from "@/components/ui";

export const metadata = { title: "New invoice" };

export default async function NewInvoice({ params, searchParams }: { params: Promise<{ jv: string }>; searchParams: Promise<{ request?: string }> }) {
  const { jv } = await params;
  const { request } = await searchParams;
  const ctx = await requireJv(jv);
  guard(ctx, "issue_invoice");
  const ir = request ? await getInvoiceRequest(db, ctx, request).catch(() => null) : null;
  const cl = await clientsOf(ctx);
  return (
    <>
      <PageHead title="New invoice" crumbs={<Link href={`/j/${jv}/invoices`}>Invoices</Link>} context={ir ? `From invoice request ${ir.number}` : ctx.jv.companyName} />
      {cl.length === 0 ? <Notice kind="warning" title="No clients yet"><Link href={`/j/${jv}/clients/new?back=/j/${jv}/invoices/new`}>Add the client first</Link>.</Notice>
        : <InvoiceForm ctx={ctx} clients={cl} projects={await projectsOf(ctx)} request={ir ?? undefined} />}
    </>
  );
}
