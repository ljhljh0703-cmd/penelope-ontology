import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Narrative Knowledge Harness — Table Rehearsal",
  description:
    "A fixture-mode narrative rehearsal workbench with character-scoped evidence, creator-gated canon, and bounded state transitions.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to Table workbench</a>
        {children}
      </body>
    </html>
  );
}
