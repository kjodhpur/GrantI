import SearchApp from "@/components/SearchApp";
import { MATCHABLE_CAUSES, STATES } from "@/lib/taxonomy";

export default function Home() {
  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "40px 16px 64px" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "clamp(1.7rem, 4vw, 2.3rem)", marginBottom: 8 }}>Find the foundations most likely to fund your nonprofit</h1>
        <p style={{ color: "var(--muted)", margin: 0, maxWidth: 640 }}>
          Describe your mission, where you work and how much you need. We read the public IRS filings of private foundations, see who they actually
          fund, and rank the best fits with the reasons why.
        </p>
      </header>
      <SearchApp causes={MATCHABLE_CAUSES.map((c) => ({ id: c.id, label: c.label }))} states={STATES} />
    </main>
  );
}
