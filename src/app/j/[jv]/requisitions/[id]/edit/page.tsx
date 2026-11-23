import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireJv } from "@/lib/session";
import { db } from "@/db";
import { can } from "@/lib/access";
import { categoriesOf, projectsOf, supplierInvoicesOf } from "@/lib/lookups";
import { requisitionDetail } from "@/services/requisitions";
import { RequisitionForm } from "@/components/requisition-form";
import { PageHead } from "@/components/ui";

export const metadata = { title: "Edit requisition" };

export default async function EditRequisition({ params }: { params: Promise<{ jv: string; id: string }> }) {
  const { jv, id } = await params;
  const ctx = await requireJv(jv);
  const d = await requisitionDetail(db, ctx, id).catch(() => null);
  if (!d) notFound();
  if (d.r.requesterId !== ctx.userId || !["draft", "returned"].includes(d.r.status)) redirect(`/j/${jv}/requisitions/${id}`);
  return (
    <>
      <PageHead title={`Edit ${d.r.number}`} crumbs={<><Link href={`/j/${jv}/requisitions`}>Requisitions</Link> / <Link href={`/j/${jv}/requisitions/${id}`}>{d.r.number}</Link></>} />
      <RequisitionForm ctx={ctx} r={d.r} lines={d.lines} supplierInvoiceId={d.supplierLink?.si.id} projects={await projectsOf(ctx)} categories={await categoriesOf(ctx)} supplierInvoices={can(ctx, "view_finance") ? await supplierInvoicesOf(ctx) : []} />
    </>
  );
}
