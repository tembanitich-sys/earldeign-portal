import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./styles/app.css";

export const metadata: Metadata = {
  title: { default: "Portal | Earldeign Investments", template: "%s | Earldeign Investments" },
  description: "Earldeign Investments portfolio portal",
  robots: { index: false, follow: false },
};

// Functional colours (Brand Manual section 4) are pending approval; FUNCTIONAL_COLOURS=on enables them.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const fc = process.env.FUNCTIONAL_COLOURS === "on";
  return (
    <html lang="en-GB">
      <body className={fc ? "fc" : undefined}>{children}</body>
    </html>
  );
}
