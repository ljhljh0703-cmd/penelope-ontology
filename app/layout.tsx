import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Red Sail Trilogy — Penelope Ontology",
  description:
    "A creator-owned story harness that carries choices through character, world state, consequence, and payoff.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to workbench</a>
        {children}
      </body>
    </html>
  );
}
