import type { Metadata } from "next";
import Link from "next/link";
import SearchApp from "@/components/SearchApp";
import { MATCHABLE_CAUSES, STATES } from "@/lib/taxonomy";

export const metadata: Metadata = {
  title: "Grant Prospect Intelligence · Find foundations likely to fund your nonprofit",
  description: "Describe your nonprofit and get a ranked list of private foundations most likely to fund it, based on public IRS Form 990-PF filings.",
};

export default function SearchPage() {
  return (
    <div className="search-shell">
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "40px 16px 64px" }}>
        <Link href="/" className="search-home">← GPI home</Link>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: "clamp(1.7rem, 4vw, 2.3rem)", marginBottom: 8 }}>Find the foundations most likely to fund your nonprofit</h1>
          <p style={{ color: "var(--muted)", margin: 0, maxWidth: 640 }}>
            Describe your mission, where you work and how much you need. We read the public IRS filings of private foundations, see who they actually
            fund, and rank the best fits with the reasons why.
          </p>
        </header>
        <SearchApp causes={MATCHABLE_CAUSES.map((c) => ({ id: c.id, label: c.label }))} states={STATES} />
      </main>
    </div>
  );
}
