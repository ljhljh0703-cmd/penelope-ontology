import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Penelope Ontology — Causal World Simulator",
  description:
    "A creator workbench that carries every choice through character agendas, offstage reactions, world state, consequence, and payoff.",
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
