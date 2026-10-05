"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Bookmark, Check, ChevronDown, CircleHelp, CirclePlay, Download, FileText, MessageSquareText, Send, ShieldCheck, Sparkles, Target } from "lucide-react";
import { getOrganizationProfile, getReview, getSavedIds, prospectForProfile, saveProspect, submitHumanReview, updateProspectStatus } from "@/lib/api";
import type { Profile } from "@/lib/score";
import { STATES, causeLabel } from "@/lib/taxonomy";
import type { Prospect, ProspectStatus } from "@/types/prospect";

const usd = (v: number) => "$" + Math.round(v).toLocaleString("en-US");
const short = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`);
const place = (state: string | null, country: string) => (state ? (STATES[state] ? STATES[state].replace(/\b\w/g, (c) => c.toUpperCase()) : state) : country !== "US" ? country : "");
const fitWord = (score: number) => (score >= 85 ? "Strong alignment" : score >= 75 ? "Good alignment" : "Exploratory fit");
const decisionText = { confirm_fit: "Fit confirmed", reduce_priority: "Priority reduced", reject: "Marked not a fit" } as const;

export default function ProspectDetail({ foundation }: { foundation: Profile }) {
  // the organization profile and pipeline state live in this browser, so the score is computed after mount
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [hasProfile, setHasProfile] = useState(true);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<ProspectStatus>("research");
  const [note, setNote] = useState("");
  const [review, setReview] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getOrganizationProfile().then((org) => {
      const next = prospectForProfile(foundation);
      setProspect(next);
      setHasProfile(!!org);
      setStatus(next.status);
      setSaved(getSavedIds().includes(foundation.ein));
      const prior = getReview(foundation.ein);
      if (prior) { setReview(decisionText[prior.decision]); setNote(prior.note ?? ""); }
    });
  }, [foundation]);

  if (!prospect) return <main className="detail-page"><div className="detail-content"><p role="status">Loading {foundation.name}…</p></div></main>;

  const trend = Object.entries(foundation.trend).sort((a, b) => Number(a[0]) - Number(b[0]));
  const peak = Math.max(1, ...trend.map(([, v]) => v.usd));
  const where = [...Object.entries(foundation.geo_states)].sort((a, b) => b[1].usd - a[1].usd).slice(0, 3).map(([st]) => place(st, "US"));
  if (foundation.foreign_share >= 0.05) where.push(`${Math.round(foundation.foreign_share * 100)}% abroad`);
  const typical = prospect.typicalGrantMax ? `${short(prospect.typicalGrantMin)} – ${short(prospect.typicalGrantMax)} typical` : "Not enough data";
  const contact = [foundation.contact_name, foundation.contact_email, foundation.contact_phone].filter(Boolean).join(" · ");

  async function markSaved() {
    setSaved(!saved);
    await saveProspect(foundation.ein, !saved);
  }

  async function setDecision(decision: "confirm_fit" | "reduce_priority" | "reject") {
    setSubmitting(true);
    await submitHumanReview(foundation.ein, { decision, note: note.trim() || undefined });
    setReview(decisionText[decision]);
    setSubmitting(false);
  }

  async function updateStatus(value: ProspectStatus) {
    setStatus(value);
    await updateProspectStatus(foundation.ein, value);
  }

  return <main className="detail-page">
    <header className="detail-topbar"><Link className="brand" href="/platform"><span className="brand-square">G</span><span>GPI</span></Link><div><Link href="/platform">Workspace</Link><span>/</span><b>Prospect intelligence</b></div><Link className="tour-launch" href="/platform?tour=1"><CirclePlay size={14} aria-hidden="true" /><span className="tour-label-long">Take the tour</span><span className="tour-label-short">Tour</span></Link><span className="demo-badge"><i /> IRS 990-PF DATA</span></header>
    <div className="detail-content">
      <Link className="back-link" href="/platform"><ArrowLeft size={15} />Back to prospects</Link>
      <div className="detail-heading"><div><p className="eyebrow">PROSPECT INTELLIGENCE / IRS FORM 990-PF</p><h1>{prospect.name}</h1><p className="detail-subtitle">Private foundation · EIN {foundation.ein.replace(/^(\d{2})(\d{7})$/, "$1-$2")}{foundation.state ? ` · ${place(foundation.state, "US")}` : ""} · tax years {foundation.years.join(", ")}</p>{!hasProfile && <p className="detail-subtitle"><Link href="/platform">Set up your organization profile</Link> to see how well this foundation fits you.</p>}</div><div className="detail-score"><div className="score-ring"><span>{prospect.matchScore}<small>%</small></span></div><div><b>GPI match</b><span>{fitWord(prospect.matchScore)}</span></div></div></div>
      <div className="detail-actions"><button className={`toolbar-button${saved ? " active-action" : ""}`} onClick={markSaved}>{saved ? <Check size={15} /> : <Bookmark size={15} />}{saved ? "Saved" : "Save prospect"}</button><label className="toolbar-button status-action"><Target size={15} /><select aria-label="Pipeline status" value={status} onChange={(event) => updateStatus(event.target.value as ProspectStatus)}><option value="research">Research</option><option value="shortlist">Shortlist</option><option value="outreach">Outreach</option><option value="applied">Applied</option><option value="won">Won</option><option value="not_pursued">Not pursued</option></select><ChevronDown size={14} /></label><button className="toolbar-button" onClick={() => window.print()}><Download size={15} />Export brief</button><button className="button button-small" onClick={() => document.getElementById("human-review")?.scrollIntoView({ behavior: "smooth" })}>Mark outcome <ArrowUpRight size={14} /></button></div>

      <div className="detail-grid">
        <div className="detail-primary">
          <section className="detail-panel summary-panel"><div className="panel-heading"><span className="panel-icon"><Sparkles size={17} /></span><div><h2>Match summary</h2><span className="ai-label"><i />Computed from IRS filings, no AI-written text</span></div></div><p>{prospect.summary}</p><div className="summary-topics">{prospect.focusAreas.map((area) => <span key={area}>{area}</span>)}</div></section>
          <section className="detail-panel"><div className="panel-heading"><span className="panel-icon panel-icon-plain"><Target size={17} /></span><div><h2>Why it matches</h2><p>Signals contributing to the current fit assessment</p></div></div><div className="factor-list">{prospect.factors.map((factor) => <div className="factor-row" key={factor.label}><div><b>{factor.label}</b><small>{factor.confidence} confidence</small></div>{factor.score !== undefined ? <><div className="factor-track"><i style={{ width: `${factor.score}%` }} /></div><strong>{factor.score}%</strong></> : <strong className="factor-value">{factor.value}</strong>}</div>)}</div></section>
          <section className="detail-panel evidence-panel"><div className="panel-heading"><span className="panel-icon panel-icon-plain"><FileText size={17} /></span><div><h2>Evidence</h2><p>From the foundation&apos;s IRS Form 990-PF filings</p></div><span className="synthetic-stamp">PUBLIC IRS DATA</span></div><div className="evidence-list">{prospect.evidence.map((item) => <article className="evidence-item" key={item.id}><span className="evidence-icon"><FileText size={16} /></span><div><div className="evidence-title"><b>{item.title}</b><span>{item.date}</span></div><p>{item.summary}</p><small>{item.sourceLabel}</small></div><ArrowUpRight size={14} /></article>)}</div></section>
          <section className="detail-panel"><div className="panel-heading"><span className="panel-icon panel-icon-plain"><Target size={17} /></span><div><h2>Giving history</h2><p>Grants paid per tax year · USD</p></div></div><div className="giving-chart" role="img" aria-label={`Grants paid: ${trend.map(([y, v]) => `${y} ${usd(v.usd)}`).join(", ")}`}><div className="chart-y-labels"><span>{short(peak)}</span><span>{short(peak / 2)}</span><span>$0</span></div><div className="chart-bars">{trend.map(([year, v]) => <div className="chart-bar-group" key={year}><div className="chart-bar" style={{ height: `${Math.max(2, Math.round((v.usd / peak) * 100))}%` }}><span>{short(v.usd)}</span></div><small>{year}</small></div>)}</div></div><div className="chart-caption"><span><i /> {foundation.grants_n} grants of $250+ across these years</span><span>Source: IRS Form 990-PF</span></div></section>
          <section className="detail-panel grants-panel"><div className="panel-heading"><span className="panel-icon panel-icon-plain"><FileText size={17} /></span><div><h2>Largest grants</h2><p>Recipients from the filings</p></div></div><div className="grant-table"><div><b>Organization</b><b>Focus area</b><b>Location</b><b>Amount</b></div>{foundation.top_recipients.map((grant, i) => <div key={i}><span>{grant.name ?? "Unnamed recipient"}</span><span>{causeLabel(grant.cause)}</span><span>{place(grant.state, grant.country) || "—"}</span><span>{usd(grant.usd)}</span></div>)}</div></section>
        </div>
        <aside className="detail-aside"><section className="detail-panel next-action"><span className="eyebrow">RECOMMENDED NEXT ACTION</span><div className="next-icon"><ArrowUpRight size={18} /></div><h2>{foundation.open_to_apps ? "Check the foundation's current guidelines, then prepare an inquiry." : foundation.only_preselected ? "Look for a warm introduction: it gives only to pre-selected charities." : "Confirm whether it accepts applications before reaching out."}</h2><p>{foundation.open_to_apps ? `Listed contact: ${contact || "see filing"}${foundation.deadlines ? `. Deadlines: ${foundation.deadlines}` : ""}.` : "Filings list no application contact. Board or staff connections are the usual route."}</p><button className="quiet-link" onClick={() => document.getElementById("human-review")?.scrollIntoView({ behavior: "smooth" })}>Add a research note <ArrowLeft size={13} /></button></section>
          <section id="human-review" className="detail-panel review-panel"><div className="review-heading"><span className="panel-icon"><ShieldCheck size={17} /></span><div><h2>Human review</h2><p>AI recommends. Fundraisers decide.</p></div></div><p className="review-intro">Record your judgment to keep this recommendation useful to your team.</p><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note for your team…" aria-label="Human review note" rows={3} /><div className="review-buttons"><button disabled={submitting} onClick={() => setDecision("confirm_fit")}><Check size={14} />Confirm fit</button><button disabled={submitting} onClick={() => setDecision("reduce_priority")}><ArrowDownChevron />Reduce priority</button><button disabled={submitting} onClick={() => setDecision("reject")}><CircleHelp size={14} />Reject</button></div>{review && <p className="review-confirmation" role="status"><Check size={14} />{review}, saved in this browser.</p>}<button className="send-note" onClick={async () => { if (!note.trim()) { setReview("Add a note first"); return; } await submitHumanReview(foundation.ein, { decision: getReview(foundation.ein)?.decision ?? "confirm_fit", note: note.trim() }); setReview("Note saved"); }}><MessageSquareText size={14} />Add note <Send size={13} /></button></section>
          <section className="detail-panel context-panel"><span className="eyebrow">RECORD CONTEXT</span><div><b>Foundation type</b><span>Private foundation</span></div><div><b>Giving range</b><span>{typical}</span></div><div><b>Geography</b><span>{where.join(" · ") || "—"}</span></div><div><b>Latest filing</b><span>Tax year {foundation.years[foundation.years.length - 1] ?? "—"}</span></div><div><b>Applications</b><span>{foundation.open_to_apps ? "Lists application contact" : foundation.only_preselected ? "Pre-selected charities only" : "No contact listed"}</span></div><div className="context-caveat"><CircleHelp size={14} />Cause labels are estimates from recipient NTEE codes and names. Verify on the foundation&apos;s own site.</div></section>
        </aside>
      </div>
      <p className="detail-footnote"><ShieldCheck size={14} />GPI is a decision-support tool. Verify source material before acting on any recommendation.</p>
    </div>
  </main>;
}

function ArrowDownChevron() {
  return <ChevronDown size={14} />;
}