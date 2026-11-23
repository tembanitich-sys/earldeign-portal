import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { jvs } from "@/db/schema";
import { createJvAction } from "../../actions";
import { ActionForm, Submit } from "@/components/forms";
import { JvSettingsFields } from "@/components/jv-settings-form";
import { PageHead } from "@/components/ui";

export const metadata = { title: "Create a JV" };

export default async function NewJv() {
  const existing = await db.select({ id: jvs.id, name: jvs.name }).from(jvs).orderBy(asc(jvs.name));
  return (
    <>
      <PageHead title="Create a joint venture" crumbs={<Link href="/admin">Joint ventures</Link>} context="This opens a new, empty JV space. Its books start at zero and its numbering at 0001." />
      <ActionForm action={createJvAction}>
        <JvSettingsFields creating />
        <section className="panel"><h2>Starting lists</h2><div className="form">
          <div className="field"><label htmlFor="projects">Projects (one per line)</label><textarea id="projects" name="projects" defaultValue={"General"} /></div>
          {existing.length ? <div className="field"><label htmlFor="copyFrom">Expense categories</label><select id="copyFrom" name="copyFrom"><option value="">Standard list</option>{existing.map((j) => <option key={j.id} value={j.id}>Copy names from {j.name}</option>)}</select><span className="hint">Only category names are copied; no data is shared.</span></div> : null}
        </div></section>
        <div className="form-actions"><Submit>Create JV</Submit></div>
      </ActionForm>
    </>
  );
}
