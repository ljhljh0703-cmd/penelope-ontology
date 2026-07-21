import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Penelope Ontology — Story Workbench",
  description:
    "Choose how Ithaca answers one uncertain signal, then watch the benefit and cost return across a bounded three-scene story.",
};

export default function StoryLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
