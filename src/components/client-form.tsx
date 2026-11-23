import { ActionForm, Submit } from "./forms";
import { Hidden } from "./doc-parts";
import { saveClientAction } from "@/app/j/[jv]/actions";

type C = { id: string; name: string; contactPerson: string | null; email: string | null; phone: string | null; address: string | null; vatNo: string | null };

export function ClientForm({ jv, c, back }: { jv: string; c?: C; back?: string }) {
  return (
    <ActionForm action={saveClientAction}>
      <Hidden jv={jv} id={c?.id} />{back ? <input type="hidden" name="back" value={back} /> : null}
      <div className="form-row">
        <div className="field"><label htmlFor="name">Client name</label><input id="name" name="name" defaultValue={c?.name} /></div>
        <div className="field"><label htmlFor="contactPerson">Contact person</label><input id="contactPerson" name="contactPerson" defaultValue={c?.contactPerson ?? ""} /></div>
      </div>
      <div className="form-row">
        <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" name="email" defaultValue={c?.email ?? ""} /></div>
        <div className="field"><label htmlFor="phone">Phone</label><input id="phone" name="phone" defaultValue={c?.phone ?? ""} /></div>
        <div className="field"><label htmlFor="vatNo">VAT number</label><input id="vatNo" name="vatNo" defaultValue={c?.vatNo ?? ""} /></div>
      </div>
      <div className="field"><label htmlFor="address">Address</label><textarea id="address" name="address" defaultValue={c?.address ?? ""} style={{ minHeight: 64 }} /></div>
      <div className="form-actions"><Submit>{c ? "Save changes" : "Add client"}</Submit></div>
    </ActionForm>
  );
}
