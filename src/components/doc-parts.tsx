import { ROLE_LABEL } from "@/lib/access";
import { fmtDateTime } from "@/lib/dates";
import type { Role } from "@/db/schema";
import { ActionForm, Submit } from "./forms";
import { ATTACHMENT_KINDS } from "@/services/attachments";
import { uploadAttachmentAction } from "@/app/j/[jv]/actions";
import { IconFile } from "./icons";
import { Empty } from "./ui";

export function Timeline({ events }: { events: { e: { id: number; action: string; actorRole: string | null; comment: string | null; at: Date }; who: string }[] }) {
  if (!events.length) return <Empty title="No activity yet" />;
  return (
    <ol className="timeline">
      {events.map(({ e, who }) => (
        <li key={e.id}>
          <div><span className="who">{who}</span>{e.actorRole ? <span className="muted">, {ROLE_LABEL[e.actorRole as Role] ?? e.actorRole}</span> : null}: {e.action}</div>
          {e.comment ? <div className="pre">&ldquo;{e.comment}&rdquo;</div> : null}
          <div className="when">{fmtDateTime(e.at)}</div>
        </li>
      ))}
    </ol>
  );
}

export function Attachments({ jv, ownerType, ownerId, items, canUpload, back, kinds }: {
  jv: string; ownerType: string; ownerId: string; back: string; canUpload: boolean; kinds?: string[];
  items: { a: { id: string; filename: string; kind: string; size: number; uploadedAt: Date }; by: string }[];
}) {
  return (
    <div>
      {items.length ? (
        <ul className="attach-list">
          {items.map(({ a, by }) => (
            <li key={a.id}>
              <IconFile size={15} /> <a href={`/api/files/${jv}/${a.id}`} target="_blank" rel="noopener">{a.filename}</a>
              <span className="muted small"> · {ATTACHMENT_KINDS[a.kind] ?? a.kind} · {(a.size / 1024).toFixed(0)} KB · {by}, {fmtDateTime(a.uploadedAt)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="muted small">No files attached yet.</p>}
      {canUpload ? (
        <ActionForm action={uploadAttachmentAction}>
          <input type="hidden" name="jv" value={jv} /><input type="hidden" name="ownerType" value={ownerType} /><input type="hidden" name="ownerId" value={ownerId} /><input type="hidden" name="back" value={back} />
          <div className="form-row">
            <div className="field"><label htmlFor={`kind-${ownerId}`}>File type</label>
              <select id={`kind-${ownerId}`} name="kind">{(kinds ?? Object.keys(ATTACHMENT_KINDS)).map((k) => <option key={k} value={k}>{ATTACHMENT_KINDS[k]}</option>)}</select>
            </div>
            <div className="field"><label htmlFor={`file-${ownerId}`}>File (PDF, JPG, PNG, XLSX, CSV; up to 10 MB)</label><input id={`file-${ownerId}`} type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.csv" /></div>
          </div>
          <div className="form-actions"><Submit variant="secondary" small>Upload file</Submit></div>
        </ActionForm>
      ) : null}
    </div>
  );
}

export function Hidden({ jv, id }: { jv: string; id?: string }) {
  return <><input type="hidden" name="jv" value={jv} />{id ? <input type="hidden" name="id" value={id} /> : null}</>;
}
