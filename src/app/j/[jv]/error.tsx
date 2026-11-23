"use client";
import { IconError } from "@/components/icons";

export default function ErrorState({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel" style={{ maxWidth: 640 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, color: "var(--ei-negative)" }}><IconError size={22} /><h1 style={{ fontSize: 24, color: "var(--ei-ink)" }}>This page could not load</h1></div>
      <p>Nothing has been changed. Try again; if it keeps happening, send the Super Admin this reference: <code>{error.digest ?? "none"}</code>.</p>
      <button className="btn btn-primary" onClick={reset}>Try again</button>
    </div>
  );
}
