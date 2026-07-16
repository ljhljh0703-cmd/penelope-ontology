import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Harness Evidence — Penelope Ontology",
  description:
    "Inspect the canon, character-knowledge, creator-gate, and replay evidence behind the story workbench.",
};

export default function TableLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
