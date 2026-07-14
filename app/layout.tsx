import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Narrative Ontology Harness — Working Build",
  description: "A provenance-aware, creator-gated narrative generation harness.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
