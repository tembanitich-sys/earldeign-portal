import Link from "next/link";
import { guard, requireJv } from "@/lib/session";

import { ClientForm } from "@/components/client-form";
import { PageHead, Panel } from "@/components/ui";

export const metadata = { title: "Add client" };

export default async function NewClient({ params, searchParams }: { params: Promise<{ jv: string }>; searchParams: Promise<{ back?: string }> }) {
  const { jv } = await params;
  const { back } = await searchParams;
  const ctx = await requireJv(jv);
  guard(ctx, "manage_clients");
  return (<><PageHead title="Add client" crumbs={<Link href={`/j/${jv}/clients`}>Clients</Link>} /><Panel><ClientForm jv={jv} back={back?.startsWith(`/j/${jv}/`) ? back : undefined} /></Panel></>);
}
