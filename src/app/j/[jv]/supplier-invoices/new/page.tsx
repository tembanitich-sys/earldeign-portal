import Link from "next/link";
import { guard, requireJv } from "@/lib/session";

import { todayIso } from "@/lib/dates";
import { ccyLabels, projectsOf } from "@/lib/lookups";
import { createSupplierInvoiceAction } from "../../actions";
import { ActionForm, SupplierLines, Submit } from "@/components/forms";
import { Hidden } from "@/components/doc-parts";
import { PageHead } from "@/components/ui";

export const metadata = { title: "Record supplier invoice" };

export default async function NewSupplierInvoice({ params }: { params: Promise<{ jv: string }> }) {
  const { jv } = await params;
  const ctx = await requireJv(jv);
  guard(ctx, "record_supplier_invoice");
  return (
    <>
      <PageHead title="Record supplier invoice" crumbs={<Link href={`/j/${jv}/supplier-invoices`}>Supplier invoices</Link>} context="Tag every line with a project. One invoice can cover several projects." />
      <ActionForm action={createSupplierInvoiceAction}>
        <Hidden jv={jv} />
        <section className="panel"><div className="form">
          <div className="form-row">
            <div className="field"><label htmlFor="supplier">Supplier</label><input id="supplier" name="supplier" /></div>
            <div className="field"><label htmlFor="supplierInvoiceNo">Supplier invoice number</label><input id="supplierInvoiceNo" name="supplierInvoiceNo" /></div>
            <div className="field"><label htmlFor="invoiceDate">Invoice date</label><input id="invoiceDate" type="date" name="invoiceDate" defaultValue={todayIso()} /></div>
          </div>
          <SupplierLines projects={await projectsOf(ctx)} currencies={ctx.jv.currencies} labels={ccyLabels} withCurrency />
          <div className="field"><label htmlFor="file">Invoice PDF</label><input id="file" type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" /></div>
        </div></section>
        <div className="form-actions"><Submit>Record invoice</Submit></div>
      </ActionForm>
    </>
  );
}
