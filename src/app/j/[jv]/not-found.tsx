import Link from "next/link";
import { IconLock } from "@/components/icons";

export default function NotAvailable() {
  return (
    <div className="panel" style={{ maxWidth: 640 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}><IconLock size={22} /><h1 style={{ fontSize: 24 }}>This page is not available</h1></div>
      <p>The record may not exist, or your role in this joint venture does not include this page.</p>
      <p className="muted small">If you think you should have access, ask the Super Admin to check your role.</p>
      <Link className="btn btn-secondary" href="/">Back to the dashboard</Link>
    </div>
  );
}
