"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, children, exact }: { href: string; children: ReactNode; exact?: boolean }) {
  const p = usePathname();
  const active = exact ? p === href : p === href || p.startsWith(href + "/");
  return <Link href={href} aria-current={active ? "page" : undefined}>{children}</Link>;
}

export function TabLink({ href, children }: { href: string; children: ReactNode }) {
  const p = usePathname();
  return <Link href={href} aria-current={p === href ? "page" : undefined}>{children}</Link>;
}
