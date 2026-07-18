import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Night of the Scar — Penelope Ontology",
  description:
    "Enter a bounded Odyssey world, make a choice as Penelope, and watch private knowledge and NPC agendas move the story.",
};

export default function WorldLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
