import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { compactUsd, pct, usd, yearRange } from "@/components/format";
import { getFoundation } from "@/lib/match";
import { CAVEATS } from "@/lib/score";
import { causeLabel } from "@/lib/taxonomy";
import s from "@/components/Detail.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Foundation profile · Grant Prospect Intelligence" };

const top = (o: Record<string, { usd: number; n: number }>, n = 8) => Object.entries(o).sort((a, b) => b[1].usd - a[1].usd).slice(0, n);

export default async function FoundationPage({ params }: { params: Promise<{ ein: string }> }) {
  const { ein } = await params;
  if (!/^\d{9}$/.test(ein)) notFound();
  let f;
  try {
    f = await getFoundation(ein);
  } catch {
    return (
      <main className={s.page}>
        <Link href="/search">← Back to search</Link>
        <p role="alert" className={s.error}>The foundation index is not available right now. Please try again later.</p>
      </main>
    );
  }
  if (!f) notFound();
  const causes = top(f.cause_mix);
  const total = f.grants_usd || 1;
  const trend = Object.entries(f.trend).sort((a, b) => Number(a[0]) - Number(b[0]));
  const contact = [f.contact_name, f.contact_email, f.contact_phone].filter(Boolean);

  return (
    <main className={s.page}>
      <Link href="/search">← Back to search</Link>
      <h1>{f.name}</h1>
      <p className={s.meta}>EIN {f.ein.replace(/^(\d{2})(\d{7})$/, "$1-$2")}{f.state ? ` · ${f.state}` : ""} · IRS 990-PF filings for tax years {yearRange(f.years)}</p>

      <section className={s.stats} aria-label="Giving summary">
        <div><strong>{compactUsd(f.grants_usd)}</strong><span>granted</span></div>
        <div><strong>{f.grants_n.toLocaleString()}</strong><span>grants</span></div>
        <div><strong>{usd(f.median_grant_usd)}</strong><span>median grant</span></div>
        <div><strong>{f.p25_grant_usd && f.p75_grant_usd ? `${compactUsd(f.p25_grant_usd)}–${compactUsd(f.p75_grant_usd)}` : "n/a"}</strong><span>typical range</span></div>
        <div><strong>{pct(f.foreign_share)}</strong><span>outside the US</span></div>
      </section>

      <section className={s.card}>
        <h2>How to apply</h2>
        {f.open_to_apps ? (
          <ul>
            {contact.length > 0 && <li>Contact: {contact.join(" · ")}</li>}
            {f.deadlines && <li>Deadlines: {f.deadlines}</li>}
            {f.app_materials && <li>What to send: {f.app_materials}</li>}
            {f.app_restrictions && <li>Restrictions: {f.app_restrictions}</li>}
          </ul>
        ) : (
          <p>{f.only_preselected ? "This foundation reported giving only to pre-selected charities, so unsolicited requests are unlikely to be considered." : "No application contact was listed in its filing."}</p>
        )}
      </section>

      {causes.length > 0 && (
        <section className={s.card}>
          <h2>What it funds</h2>
          <p className={s.meta}>Share of grant dollars touching each cause (a grant can touch more than one).</p>
          <ul className={s.bars}>
            {causes.map(([id, v]) => (
              <li key={id}>
                <span>{causeLabel(id)}</span>
                <span className={s.bar} role="img" aria-label={`${pct(v.usd / total)} of dollars`}><i style={{ width: `${Math.min(100, Math.round((v.usd / total) * 100))}%` }} /></span>
                <span className={s.num}>{pct(v.usd / total)} · {v.n} grants</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={s.card}>
        <h2>Where it gives</h2>
        <p>
          {top(f.geo_states, 6).map(([st, v]) => `${st} ${compactUsd(v.usd)}`).join(" · ") || "No US recipients with a listed state."}
        </p>
        {Object.keys(f.geo_countries).length > 0 && <p>Outside the US: {top(f.geo_countries, 6).map(([cc, v]) => `${cc} ${compactUsd(v.usd)}`).join(" · ")}</p>}
      </section>

      {f.top_recipients.length > 0 && (
        <section className={s.card}>
          <h2>Largest grants</h2>
          <ul>{f.top_recipients.map((r, i) => <li key={i}>{r.name ?? "Unnamed recipient"}{r.state ? `, ${r.state}` : r.country !== "US" ? `, ${r.country}` : ""} · {usd(r.usd)} · {causeLabel(r.cause)}</li>)}</ul>
        </section>
      )}

      {trend.length > 1 && (
        <section className={s.card}>
          <h2>Giving by tax year</h2>
          <ul>{trend.map(([y, v]) => <li key={y}>{y}: {compactUsd(v.usd)} in {v.n} grants</li>)}</ul>
        </section>
      )}

      <p className={s.meta}>{CAVEATS.join(" ")}</p>
    </main>
  );
}
