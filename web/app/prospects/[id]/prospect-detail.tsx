"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowUpRight, Bookmark, Check, ChevronDown, CircleHelp, CirclePlay, Download, FileText, MessageSquareText, Send, ShieldCheck, Sparkles, Target } from "lucide-react";
import { saveProspect, submitHumanReview, updateProspectStatus } from "@/lib/api";
import type { Prospect, ProspectStatus } from "@/types/prospect";

const years = [
  { year: "2021", value: 54 },
  { year: "2022", value: 70 },
  { year: "2023", value: 48 },
  { year: "2024", value: 88 },
];

export default function ProspectDetail({ prospect }: { prospect: Prospect }) {
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<ProspectStatus>(prospect.status);
  const [note, setNote] = useState("");
  const [review, setReview] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function markSaved() {
    setSaved(!saved);
    if (!saved) await saveProspect(prospect.id);
  }

  async function setDecision(decision: "confirm_fit" | "reduce_priority" | "reject") {
    setSubmitting(true);
    await submitHumanReview(prospect.id, { decision, note: note.trim() || undefined });
    setReview(decision === "confirm_fit" ? "Fit confirmed" : decision === "reduce_priority" ? "Priority reduced" : "Marked not a fit");
    setSubmitting(false);
  }

  async function updateStatus(value: ProspectStatus) {
    setStatus(value);
    await updateProspectStatus(prospect.id, value);
  }

  return <main className="detail-page">
    <header className="detail-topbar"><Link className="brand" href="/platform"><span className="brand-square">G</span><span>GPI</span></Link><div><Link href="/platform">Workspace</Link><span>/</span><b>Prospect intelligence</b></div><Link className="tour-launch" href="/platform?tour=1"><CirclePlay size={14} aria-hidden="true" /><span className="tour-label-long">Take the tour</span><span className="tour-label-short">Tour</span></Link><span className="demo-badge"><i /> DEMO DATA</span></header>
    <div className="detail-content">
      <Link className="back-link" href="/platform"><ArrowLeft size={15} />Back to prospects</Link>
      <div className="detail-heading"><div><p className="eyebrow">PROSPECT INTELLIGENCE / SYNTHETIC RECORD</p><h1>{prospect.name}</h1><p className="detail-subtitle">Private foundation · Modeled giving profile · Arizona / Southwest</p></div><div className="detail-score"><div className="score-ring"><span>{prospect.matchScore}<small>%</small></span></div><div><b>GPI match</b><span>Strong alignment</span></div></div></div>
      <div className="detail-actions"><button className={`toolbar-button${saved ? " active-action" : ""}`} onClick={markSaved}>{saved ? <Check size={15} /> : <Bookmark size={15} />}{saved ? "Saved" : "Save prospect"}</button><label className="toolbar-button status-action"><Target size={15} /><select aria-label="Pipeline status" value={status} onChange={(event) => updateStatus(event.target.value as ProspectStatus)}><option value="research">Research</option><option value="shortlist">Shortlist</option><option value="outreach">Outreach</option><option value="applied">Applied</option><option value="won">Won</option><option value="not_pursued">Not pursued</option></select><ChevronDown size={14} /></label><button className="toolbar-button" onClick={() => window.print()}><Download size={15} />Export brief</button><button className="button button-small" onClick={() => document.getElementById("human-review")?.scrollIntoView({ behavior: "smooth" })}>Mark outcome <ArrowUpRight size={14} /></button></div>

      <div className="detail-grid">
        <div className="detail-primary">
          <section className="detail-panel summary-panel"><div className="panel-heading"><span className="panel-icon"><Sparkles size={17} /></span><div><h2>Match summary</h2><span className="ai-label"><i />AI-generated demo analysis</span></div></div><p>{prospect.summary}</p><div className="summary-topics">{prospect.focusAreas.map((area) => <span key={area}>{area}</span>)}</div></section>
          <section className="detail-panel"><div className="panel-heading"><span className="panel-icon panel-icon-plain"><Target size={17} /></span><div><h2>Why it matches</h2><p>Signals contributing to the current fit assessment</p></div></div><div className="factor-list">{prospect.factors.map((factor) => <div className="factor-row" key={factor.label}><div><b>{factor.label}</b><small>{factor.confidence} confidence</small></div>{factor.score !== undefined ? <><div className="factor-track"><i style={{ width: `${factor.score}%` }} /></div><strong>{factor.score}%</strong></> : <strong className="factor-value">{factor.value}</strong>}</div>)}</div></section>
          <section className="detail-panel evidence-panel"><div className="panel-heading"><span className="panel-icon panel-icon-plain"><FileText size={17} /></span><div><h2>Evidence</h2><p>Source-style context for human review</p></div><span className="synthetic-stamp">SYNTHETIC / MOCK</span></div><div className="evidence-list">{prospect.evidence.map((item) => <article className="evidence-item" key={item.id}><span className="evidence-icon"><FileText size={16} /></span><div><div className="evidence-title"><b>{item.title}</b><span>{item.date}</span></div><p>{item.summary}</p><small>{item.sourceLabel}</small></div><ArrowUpRight size={14} /></article>)}</div></section>
          <section className="detail-panel"><div className="panel-heading"><span className="panel-icon panel-icon-plain"><Target size={17} /></span><div><h2>Giving history</h2><p>Illustrative modeled grant totals · USD</p></div></div><div className="giving-chart" role="img" aria-label="Synthetic giving history: 2021 54 thousand dollars, 2022 70 thousand, 2023 48 thousand, 2024 88 thousand"><div className="chart-y-labels"><span>$100k</span><span>$50k</span><span>$0</span></div><div className="chart-bars">{years.map(({ year, value }) => <div className="chart-bar-group" key={year}><div className="chart-bar" style={{ height: `${value}%` }}><span>${value}k</span></div><small>{year}</small></div>)}</div></div><div className="chart-caption"><span><i /> Synthetic historical grants</span><span>Values are illustrative</span></div></section>
          <section className="detail-panel grants-panel"><div className="panel-heading"><span className="panel-icon panel-icon-plain"><FileText size={17} /></span><div><h2>Known grants</h2><p>Fictional organizations and awards</p></div></div><div className="grant-table"><div><b>Organization</b><b>Focus area</b><b>Year</b><b>Amount</b></div>{[["Mesa Youth Collective", "Youth development", "2024", "$42,000"], ["Desert Harvest Network", "Food access", "2023", "$35,000"], ["Sunrise Learning Hub", "Education access", "2022", "$28,000"]].map((grant) => <div key={grant[0]}>{grant.map((value) => <span key={value}>{value}</span>)}</div>)}</div></section>
        </div>
        <aside className="detail-aside"><section className="detail-panel next-action"><span className="eyebrow">RECOMMENDED NEXT ACTION</span><div className="next-icon"><ArrowUpRight size={18} /></div><h2>Research the current food-access initiative before outreach.</h2><p>Confirm the program is active and check whether a local introduction is available.</p><button className="quiet-link" onClick={() => document.getElementById("human-review")?.scrollIntoView({ behavior: "smooth" })}>Add a research note <ArrowLeft size={13} /></button></section>
          <section id="human-review" className="detail-panel review-panel"><div className="review-heading"><span className="panel-icon"><ShieldCheck size={17} /></span><div><h2>Human review</h2><p>AI recommends. Fundraisers decide.</p></div></div><p className="review-intro">Record your judgment to keep this recommendation useful to your team.</p><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note for your team…" aria-label="Human review note" rows={3} /><div className="review-buttons"><button disabled={submitting} onClick={() => setDecision("confirm_fit")}><Check size={14} />Confirm fit</button><button disabled={submitting} onClick={() => setDecision("reduce_priority")}><ArrowDownChevron />Reduce priority</button><button disabled={submitting} onClick={() => setDecision("reject")}><CircleHelp size={14} />Reject</button></div>{review && <p className="review-confirmation" role="status"><Check size={14} />{review} recorded for this demo.</p>}<button className="send-note" onClick={() => setReview(note.trim() ? "Note saved" : "Add a note first")}><MessageSquareText size={14} />Add note <Send size={13} /></button></section>
          <section className="detail-panel context-panel"><span className="eyebrow">RECORD CONTEXT</span><div><b>Foundation type</b><span>Private foundation</span></div><div><b>Giving range</b><span>$25k – $85k typical</span></div><div><b>Geography</b><span>Arizona · Southwest</span></div><div><b>Last modeled update</b><span>March 2025</span></div><div className="context-caveat"><CircleHelp size={14} />All details on this page are synthetic demo content.</div></section>
        </aside>
      </div>
      <p className="detail-footnote"><ShieldCheck size={14} />GPI is a decision-support tool. Verify source material before acting on any recommendation.</p>
    </div>
  </main>;
}

function ArrowDownChevron() {
  return <ChevronDown size={14} />;
}