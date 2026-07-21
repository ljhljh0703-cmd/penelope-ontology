import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Penelope Ontology — Portable Story Worlds",
  description:
    "Load a bounded story world, make a consequential choice, and watch private knowledge and NPC agendas move the story without breaking its canon.",
};

export default function WorldLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
