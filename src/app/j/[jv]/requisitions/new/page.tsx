import Link from "next/link";
import { guard, requireJv } from "@/lib/session";

import { categoriesOf, projectsOf, supplierInvoicesOf } from "@/lib/lookups";
import { RequisitionForm } from "@/components/requisition-form";
import { PageHead } from "@/components/ui";
import { can } from "@/lib/access";

export const metadata = { title: "New requisition" };

export default async function NewRequisition({ params, searchParams }: { params: Promise<{ jv: string }>; searchParams: Promise<{ parent?: string }> }) {
  const { jv } = await params;
  const { parent } = await searchParams;
  const ctx = await requireJv(jv);
  guard(ctx, "create_requisition");
  const flow = ctx.roles.includes("cto") ? "It goes to the Finance Officer for approval, then to a Finance Clerk for disbursement." : "It goes to the CTO first, then to the Finance Officer, then to a Finance Clerk.";
  return (
    <>
      <PageHead title={parent ? "Supplementary requisition" : "New requisition"} crumbs={<Link href={`/j/${jv}/requisitions`}>Requisitions</Link>} context={flow} />
      <RequisitionForm ctx={ctx} projects={await projectsOf(ctx)} categories={await categoriesOf(ctx)} supplierInvoices={can(ctx, "view_finance") ? await supplierInvoicesOf(ctx) : []} parentId={parent} />
    </>
  );
}
