// 1.5 px line icons on a 24 px grid, square ends (Brand Manual v1.2 section 5).
import type { ReactNode } from "react";

function Icon({ children, size = 16, label }: { children: ReactNode; size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter" aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label}>
      {children}
    </svg>
  );
}

export const IconCheck = (p: { size?: number }) => <Icon {...p}><path d="M4 12.5l5 5L20 6.5" /></Icon>;
export const IconClock = (p: { size?: number }) => <Icon {...p}><circle cx="12" cy="12" r="8.25" /><path d="M12 7.5V12l3 2" /></Icon>;
export const IconAlert = (p: { size?: number }) => <Icon {...p}><path d="M12 3.75L21 19.5H3L12 3.75z" /><path d="M12 9.5v4.5M12 16.5v.5" /></Icon>;
export const IconX = (p: { size?: number }) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const IconDraft = (p: { size?: number }) => <Icon {...p}><path d="M4.5 19.5h3.75L19 8.75 15.25 5 4.5 15.75V19.5z" /></Icon>;
export const IconInfo = (p: { size?: number }) => <Icon {...p}><circle cx="12" cy="12" r="8.25" /><path d="M12 11v5.5M12 7.5v.5" /></Icon>;
export const IconLock = (p: { size?: number }) => <Icon {...p}><rect x="5.25" y="10.5" width="13.5" height="9.75" /><path d="M8.25 10.5V7.5a3.75 3.75 0 017.5 0v3" /></Icon>;
export const IconReturn = (p: { size?: number }) => <Icon {...p}><path d="M9 5.5L4.5 10 9 14.5" /><path d="M4.5 10H15a4.5 4.5 0 010 9h-3" /></Icon>;
export const IconFile = (p: { size?: number }) => <Icon {...p}><path d="M6 3.75h8.25L18 7.5v12.75H6V3.75z" /><path d="M14.25 3.75V7.5H18" /></Icon>;
export const IconError = (p: { size?: number }) => <Icon {...p}><circle cx="12" cy="12" r="8.25" /><path d="M12 7.5v5.5M12 15.5v.5" /></Icon>;
