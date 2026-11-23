import Link from "next/link";
import { guard, requireJv } from "@/lib/session";
import { db } from "@/db";
import { can } from "@/lib/access";
import { fmtDate } from "@/lib/dates";
import { listSupplierInvoices } from "@/services/suppliers";
import { Empty, Money, PageHead, Panel, PeriodContext, Status } from "@/components/ui";

export const metadata = { title: "Supplier invoices" };
const LABEL: Record<string, string> = { open: "Unpaid", part_paid: "Part paid", paid: "Paid" };

export default async function SupplierInvoices({ params }: { params: Promise<{ jv: string }> }) {
  const { jv } = await params;
  const ctx = await requireJv(jv);
  guard(ctx, "view_finance");
  const rows = await listSupplierInvoices(db, ctx);
  return (
    <>
      <PageHead title="Supplier invoices" context={<>What the JV owes developers and other suppliers. Recording an invoice does not change the loan; paying it does. <PeriodContext jvName={ctx.jv.name} currencies={ctx.jv.currencies} /></>}
        actions={can(ctx, "record_supplier_invoice") ? <Link className="btn btn-primary" href={`/j/${jv}/supplier-invoices/new`}>Record supplier invoice</Link> : null} />
      <Panel flush>
        {rows.length ? (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Supplier</th><th>Invoice no.</th><th>Date</th><th>Status</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Outstanding</th></tr></thead>
            <tbody>{rows.map(({ si, paid, outstanding, status }) => (
              <tr key={si.id}><td><Link href={`/j/${jv}/supplier-invoices/${si.id}`}>{si.supplier}</Link></td><td>{si.supplierInvoiceNo}</td><td>{fmtDate(si.invoiceDate)}</td>
                <td>{si.disputed ? <Status status="disputed" label="Disputed" /> : <Status status={status} label={LABEL[status]} />}</td>
                <td className="num"><Money minor={si.total} currency={si.currency} /></td><td className="num"><Money minor={paid} /></td><td className="num"><Money minor={outstanding} /></td></tr>
            ))}</tbody>
          </table></div>
        ) : <Empty title="No supplier invoices yet">Record developer and supplier invoices per project to track total cost, payments and what is still owed.</Empty>}
      </Panel>
    </>
  );
}
