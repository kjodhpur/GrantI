"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Match, MatchResponse } from "@/lib/match";
import { compactUsd, pct, usd, yearRange } from "./format";
import s from "./SearchApp.module.css";

type Cause = { id: string; label: string };
type Sel = { causes: string[]; states: string[]; intl: boolean; ask: string };

const EXAMPLES = [
  "We fight childhood hunger and malnutrition in East Africa. We typically ask for $30,000.",
  "After-school tutoring and mentoring for low-income kids in Ohio and Pennsylvania, asking about $25k.",
  "Animal rescue and adoption programs in Texas.",
];

export default function SearchApp({ causes, states }: { causes: Cause[]; states: Record<string, string> }) {
  const [text, setText] = useState("");
  const [sel, setSel] = useState<Sel>({ causes: [], states: [], intl: false, ask: "" });
  const [touched, setTouched] = useState(false); // user edited the refine controls -> send them, not just the text
  const [requireOpen, setRequireOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<MatchResponse | null>(null);
  const [showRefine, setShowRefine] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (res) headingRef.current?.focus();
  }, [res]);

  const edit = (patch: Partial<Sel>) => {
    setSel((p) => ({ ...p, ...patch }));
    setTouched(true);
  };
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function search(e?: React.FormEvent, overrideOpen?: boolean) {
    e?.preventDefault();
    const open = overrideOpen ?? requireOpen;
    const hasChips = touched && (sel.causes.length || sel.states.length || sel.intl || sel.ask);
    if (text.trim().length < 3 && !hasChips) {
      setError("Tell us what your nonprofit does, or pick at least one cause under Refine.");
      return;
    }
    const body: Record<string, unknown> = { requireOpen: open, limit: 20 };
    if (text.trim().length >= 3) body.text = text.trim();
    if (touched) {
      body.causes = sel.causes.map((id) => ({ id }));
      body.states = sel.states;
      body.international = sel.intl;
      const ask = Number(sel.ask.replace(/[$,\s]/g, ""));
      if (sel.ask && Number.isFinite(ask) && ask > 0) body.askUsd = ask;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/match", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Something went wrong. Please try again.");
      setRes(j);
      if (!touched) {
        // show how we read the description so it can be corrected
        const c = j.criteria;
        setSel({ causes: c.causes.map((x: { id: string }) => x.id), states: c.states, intl: c.international, ask: c.askUsd ? String(c.askUsd) : "" });
        setShowRefine(true);
      }
    } catch (err) {
      setRes(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const years = res ? [...new Set(res.results.flatMap((m) => m.giving.years))].sort() : [];

  return (
    <>
      <form onSubmit={search} className={s.card} aria-describedby="disclaimer">
        <label htmlFor="mission" className={s.label}>Tell us about your nonprofit</label>
        <p className={s.hint}>What you do, who you serve, where, and roughly how much you would ask a foundation for.</p>
        <textarea id="mission" className={s.textarea} rows={4} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="e.g. We provide school meals and nutrition education for children in rural Kenya. We typically ask for $30,000." />
        <div className={s.examples}>
          <span className={s.hint}>Try an example:</span>
          {EXAMPLES.map((ex, i) => (
            <button type="button" key={i} className={s.linkBtn} onClick={() => { setText(ex); setTouched(false); }}>{ex.split(/[.,]/)[0]}</button>
          ))}
        </div>

        <details className={s.refine} open={showRefine} onToggle={(e) => setShowRefine((e.target as HTMLDetailsElement).open)}>
          <summary>Refine (optional){res ? " · how we read your description" : ""}</summary>
          <fieldset className={s.fieldset}>
            <legend>Causes</legend>
            <div className={s.chips}>
              {causes.map((c) => (
                <label key={c.id} className={`${s.chip} ${sel.causes.includes(c.id) ? s.chipOn : ""}`}>
                  <input type="checkbox" className="visually-hidden" checked={sel.causes.includes(c.id)} onChange={() => edit({ causes: toggle(sel.causes, c.id) })} />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className={s.row}>
            <div>
              <label htmlFor="state-add" className={s.smallLabel}>US states you serve</label>
              <select id="state-add" className={s.input} value="" onChange={(e) => e.target.value && edit({ states: toggle(sel.states, e.target.value) })}>
                <option value="">Add a state…</option>
                {Object.entries(states).map(([abbr, name]) => (
                  <option key={abbr} value={abbr}>{name.replace(/\b(?!of\b)\w/g, (m) => m.toUpperCase())}</option>
                ))}
              </select>
              <div className={s.chips}>
                {sel.states.map((st) => (
                  <button type="button" key={st} className={`${s.chip} ${s.chipOn}`} onClick={() => edit({ states: toggle(sel.states, st) })} aria-label={`Remove ${st}`}>{st} ×</button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="ask" className={s.smallLabel}>Typical grant you would ask for (USD)</label>
              <input id="ask" className={s.input} inputMode="numeric" placeholder="e.g. 30000" value={sel.ask} onChange={(e) => edit({ ask: e.target.value })} />
              <label className={s.check}>
                <input type="checkbox" checked={sel.intl} onChange={(e) => edit({ intl: e.target.checked })} /> We work outside the US
              </label>
            </div>
          </div>
        </details>

        <div className={s.actions}>
          <label className={s.check}>
            <input type="checkbox" checked={requireOpen} onChange={(e) => setRequireOpen(e.target.checked)} /> Only foundations that list application contact info
          </label>
          <button type="submit" className={s.primary} disabled={loading}>{loading ? "Searching…" : "Find funders"}</button>
        </div>
        <p id="disclaimer" className={s.hint}>We rank foundations from public IRS Form 990-PF filings. We do not contact anyone on your behalf.</p>
      </form>

      <section aria-live="polite" aria-busy={loading}>
        {error && <p role="alert" className={s.error}>{error}</p>}
        {res && (
          <>
            <h2 ref={headingRef} tabIndex={-1} className={s.resultsTitle}>
              {res.results.length ? `${res.results.length} best-matching foundations` : "No matching foundations"}
            </h2>
            {years.length > 0 && <p className={s.hint}>Based on IRS 990-PF filings for tax years {yearRange(years)}. Ranked by fit to your causes, location, grant size and giving capacity.</p>}
            {res.warnings.map((w, i) => <p key={i} className={s.notice}>{w}</p>)}
            {!res.results.length && requireOpen && (
              <button type="button" className={s.secondary} onClick={() => { setRequireOpen(false); search(undefined, false); }}>Include foundations that only give to pre-selected charities</button>
            )}
            <ol className={s.results}>
              {res.results.map((m, i) => <ResultCard key={m.ein} m={m} rank={i + 1} />)}
            </ol>
            {res.results.length > 0 && (
              <div className={s.caveats}>
                <strong>Read before you reach out</strong>
                <ul>{res.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

const COMPONENT_LABEL: Record<string, string> = { cause: "Cause fit", geo: "Location fit", size: "Grant size fit", capacity: "Giving capacity", access: "Accepts applications" };

function ResultCard({ m, rank }: { m: Match; rank: number }) {
  const c = m.contact;
  const anyOutcome = m.prior_outcomes.funded + m.prior_outcomes.approached + m.prior_outcomes.declined > 0;
  return (
    <li className={s.result}>
      <div className={s.resultHead}>
        <span className={s.rank} aria-hidden>{rank}</span>
        <div className={s.resultTitle}>
          <h3><Link href={`/foundations/${m.ein}`}>{m.name}</Link></h3>
          <p className={s.meta}>EIN {m.ein.replace(/^(\d{2})(\d{7})$/, "$1-$2")}{m.state ? ` · ${m.state}` : ""}</p>
        </div>
        <div className={s.score} aria-label={`Match score ${m.score} out of 100`}><strong>{m.score}</strong><span>match</span></div>
      </div>
      <p>
        {m.open_to_apps
          ? <span className={`${s.badge} ${s.badgeGood}`}>Lists application contact</span>
          : <span className={`${s.badge} ${s.badgeWarn}`}>Pre-selected charities only</span>}
        {m.matched_causes.map((mc) => <span key={mc.id} className={s.badge}>{mc.label} · {pct(mc.share_of_dollars)} of giving</span>)}
      </p>
      <ul className={s.why}>{m.rationale.map((r, i) => <li key={i}>{r}</li>)}</ul>
      {m.open_to_apps && (c.name || c.email || c.phone || c.deadlines || c.materials) && (
        <div className={s.apply}>
          <strong>How to apply (from its filing)</strong>
          <ul>
            {(c.name || c.email || c.phone) && <li>Contact: {[c.name, c.email, c.phone].filter(Boolean).join(" · ")}</li>}
            {c.deadlines && <li>Deadlines: {c.deadlines}</li>}
            {c.materials && <li>What to send: {c.materials}</li>}
            {c.restrictions && <li>Restrictions: {c.restrictions}</li>}
          </ul>
        </div>
      )}
      <p className={s.meta}>
        Gave {compactUsd(m.giving.grants_usd)} in {m.giving.grants_n.toLocaleString()} grants · median grant {usd(m.giving.median_grant_usd)}
      </p>
      {anyOutcome && <p className={s.meta}>Logged by other nonprofits: {m.prior_outcomes.funded} funded, {m.prior_outcomes.approached} approached, {m.prior_outcomes.declined} declined.</p>}
      <details className={s.breakdown}>
        <summary>Score breakdown &amp; example grants</summary>
        <ul className={s.bars}>
          {Object.entries(m.components).map(([k, v]) => (
            <li key={k}>
              <span>{COMPONENT_LABEL[k]}</span>
              {v === null ? <em>not requested</em> : <span className={s.bar} role="img" aria-label={`${Math.round(v * 100)} percent`}><i style={{ width: `${Math.round(v * 100)}%` }} /></span>}
            </li>
          ))}
        </ul>
        {m.example_recipients.length > 0 && (
          <>
            <p className={s.meta}>Largest recent grants:</p>
            <ul>{m.example_recipients.slice(0, 4).map((r, i) => <li key={i}>{r.name ?? "Unnamed recipient"}{r.state ? `, ${r.state}` : r.country !== "US" ? `, ${r.country}` : ""} · {usd(r.usd)}</li>)}</ul>
          </>
        )}
      </details>
    </li>
  );
}
