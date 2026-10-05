"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowUpDown, Bell, Bookmark, BookmarkCheck, Building2, Check, ChevronDown, CirclePlay, Compass, Database, House, LayoutDashboard, Plus, Search, ShieldCheck, Sparkles, SquareKanban, Trophy, X } from "lucide-react";
import { analyzeProspect, getDashboardMetrics, getOrganizationProfile, getProspects, saveProspect, updateProspectStatus } from "@/lib/api";
import type { OrganizationProfile, Prospect, ProspectStatus } from "@/types/prospect";
import ProductTour, { type TourStep } from "./product-tour";

type View = "overview" | "saved" | "pipeline" | "outcomes" | "profile";
type Fit = "all" | "high" | "good" | "exploratory";
type Sort = "match_desc" | "match_asc" | "grant_desc" | "name";
type Metrics = Awaited<ReturnType<typeof getDashboardMetrics>>;

const statusLabels: Record<ProspectStatus, string> = {
  research: "Research",
  shortlist: "Shortlist",
  outreach: "Outreach",
  applied: "Applied",
  won: "Won",
  not_pursued: "Not pursued",
};
const statuses = Object.keys(statusLabels) as ProspectStatus[];
const pipelineStages: ProspectStatus[] = ["research", "shortlist", "outreach", "applied", "won"];

const fitLabels: Record<Fit, string> = { all: "All fits", high: "High fit · 85+", good: "Good fit · 75–84", exploratory: "Exploratory · under 75" };
const fitFor = (score: number): Fit => (score >= 85 ? "high" : score >= 75 ? "good" : "exploratory");

const sortLabels: Record<Sort, string> = { match_desc: "Best match", match_asc: "Lowest match", grant_desc: "Largest grant", name: "Name A–Z" };
const sorters: Record<Sort, (a: Prospect, b: Prospect) => number> = {
  match_desc: (a, b) => b.matchScore - a.matchScore,
  match_asc: (a, b) => a.matchScore - b.matchScore,
  grant_desc: (a, b) => b.typicalGrantMax - a.typicalGrantMax,
  name: (a, b) => a.name.localeCompare(b.name),
};

const TOUR_SEEN_KEY = "gpi-tour-seen";
const tourSteps: (TourStep & { view?: View })[] = [
  { eyebrow: "PRODUCT TOUR", title: "Welcome to GPI", view: "overview", body: <><p>GPI helps your fundraising team find the foundations most likely to fund your work, explains why each one fits, and keeps your team in charge of every decision.</p><p>This two-minute tour walks through the whole platform. Everything in this workspace is <b>fictional demo data</b>, so feel free to click around.</p></> },
  { target: "nav", view: "overview", eyebrow: "WORKSPACE", title: "Five views, one workspace", body: <><p>Move between the parts of your prospecting workflow here:</p><ul><li><b>Overview:</b> ranked prospects and headline numbers</li><li><b>Saved:</b> funders you bookmarked</li><li><b>Pipeline:</b> where every prospect stands</li><li><b>Outcomes:</b> what you applied for and won</li><li><b>Organization profile:</b> what GPI matches against</li></ul></> },
  { target: "metrics", view: "overview", eyebrow: "OVERVIEW", title: "Your prospecting at a glance", body: <p>How many funders GPI has analyzed for you, how many are a high fit, the potential funding they represent, and how many you are actively pursuing. The <b>Demo data</b> label marks figures that are illustrative.</p> },
  { target: "analyze", view: "overview", eyebrow: "ANALYZE", title: "Check any funder on demand", body: <p>Heard about a foundation from a board member? Enter its name and your mission, and GPI scores it against your profile and adds it to your list. In this demo it creates a synthetic record so you can see the flow.</p> },
  { target: "toolbar", view: "overview", eyebrow: "SEARCH & SORT", title: "Find the right funder fast", body: <p>Search by foundation name, focus area, or region. Sort by best match, lowest match, largest typical grant, or name to plan your week.</p> },
  { target: "filters", view: "overview", eyebrow: "FILTERS", title: "Focus on the best fits", body: <><p><b>Fit bands</b> group prospects by match score: High fit (85+), Good fit (75–84) and Exploratory (under 75).</p><p><b>Status filters</b> show only prospects at a given stage, such as everything still in Research.</p></> },
  { target: "row", view: "overview", eyebrow: "RANKED PROSPECTS", title: "Every prospect, scored and explained", body: <><p>Each row shows the <b>match score</b>, the funder&apos;s typical grant range, focus areas, geography and any recent signal.</p><p>Use the <b>bookmark</b> to save a prospect and the <b>status menu</b> to move it through your pipeline. Changes appear across every view.</p></> },
  { target: "prospect-link", view: "overview", eyebrow: "PROSPECT INTELLIGENCE", title: "Open a funder for the full story", body: <><p>Click any foundation name to see its intelligence page:</p><ul><li>A plain-language <b>match summary</b></li><li><b>Why it matches:</b> mission, geography, giving pattern and grant size, each with a confidence level</li><li><b>Evidence</b> from filings and grant history, plus giving trends</li><li>A <b>recommended next action</b> and a printable brief</li></ul></> },
  { target: "prospect-link", view: "overview", eyebrow: "HUMAN REVIEW", title: "AI recommends. Your team decides.", body: <p>On every prospect page your team can <b>confirm fit</b>, <b>reduce priority</b>, or <b>reject</b> a recommendation and add a note. GPI is a decision-support tool: always verify the sources before acting.</p> },
  { target: "view-panel", view: "saved", eyebrow: "SAVED", title: "Your shortlist in one place", body: <p>Everything you bookmark collects here, with the same search, filters and status controls as the overview, so you can work from a short list.</p> },
  { target: "view-panel", view: "pipeline", eyebrow: "PIPELINE", title: "See where every prospect stands", body: <p>Prospects move from <b>Research</b> to <b>Shortlist</b>, <b>Outreach</b>, <b>Applied</b> and <b>Won</b>. Click any name to jump straight to its intelligence page.</p> },
  { target: "view-panel", view: "outcomes", eyebrow: "OUTCOMES", title: "Learn from every result", body: <p>Track what you won, what is awaiting a decision, and what you chose not to pursue. Recording outcomes helps GPI learn which signals matter to your team.</p> },
  { target: "view-panel", view: "profile", eyebrow: "ORGANIZATION PROFILE", title: "What GPI matches against", body: <p>Your mission, geography, focus areas and funding need. Every match score is calculated against this profile, so keeping it current keeps your rankings accurate.</p> },
  { target: "data-links", view: "overview", eyebrow: "REAL DATA", title: "Explore real IRS foundation data", body: <><p><b>Foundation search</b> ranks real private foundations from public IRS Form 990-PF filings using your mission, location and ask.</p><p>The <b>IRS dataset explorer</b> lets you browse the underlying foundation records directly.</p></> },
  { view: "overview", eyebrow: "YOU'RE READY", title: "That's the platform", body: <><p>Start with your highest-fit prospects, open one to review the evidence, and record your decision. You can replay this tour any time with the <b>Take the tour</b> tab at the top right, next to Demo data.</p></> },
];

const viewTitles: Record<View, string> = { overview: "Overview", saved: "Saved prospects", pipeline: "Pipeline", outcomes: "Outcomes", profile: "Organization profile" };
const grantRange = (prospect: Prospect) => `$${Math.round(prospect.typicalGrantMin / 1000)}k – $${Math.round(prospect.typicalGrantMax / 1000)}k`;
const isSessionRecord = (prospect: Prospect) => prospect.id.startsWith("analysis-");
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();

export default function PlatformWorkspace() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [fit, setFit] = useState<Fit>("all");
  const [status, setStatus] = useState<ProspectStatus | "all">("all");
  const [sort, setSort] = useState<Sort>("match_desc");
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const analyzeButton = useRef<HTMLButtonElement>(null);
  const tourButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getDashboardMetrics(), getProspects(), getOrganizationProfile()]).then(([nextMetrics, nextProspects, nextProfile]) => {
      if (!active) return;
      setMetrics(nextMetrics);
      setProspects(nextProspects);
      setProfile(nextProfile);
      // Offer the tour on a first visit, or always when linked with ?tour=1.
      let seen = false;
      try { seen = localStorage.getItem(TOUR_SEEN_KEY) === "1"; } catch { /* storage unavailable */ }
      if (!seen || new URLSearchParams(window.location.search).get("tour") === "1") setTourIndex(0);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const loading = metrics === null || profile === null;
  const savedProspects = prospects.filter((prospect) => saved.has(prospect.id));
  const activePursuits = prospects.filter((prospect) => ["shortlist", "outreach", "applied"].includes(prospect.status)).length;

  const visible = useMemo(() => {
    const base = view === "saved" ? prospects.filter((prospect) => saved.has(prospect.id)) : prospects;
    const needle = query.trim().toLowerCase();
    return base
      .filter((prospect) => !needle || `${prospect.name} ${prospect.focusAreas.join(" ")} ${prospect.geography.join(" ")}`.toLowerCase().includes(needle))
      .filter((prospect) => fit === "all" || fitFor(prospect.matchScore) === fit)
      .filter((prospect) => status === "all" || prospect.status === status)
      .sort(sorters[sort]);
  }, [prospects, saved, view, query, fit, status, sort]);

  async function toggleSave(prospect: Prospect) {
    const wasSaved = saved.has(prospect.id);
    setSaved((current) => {
      const next = new Set(current);
      if (wasSaved) next.delete(prospect.id);
      else next.add(prospect.id);
      return next;
    });
    if (!wasSaved) await saveProspect(prospect.id);
    setToast(wasSaved ? `Removed ${prospect.name} from saved prospects.` : `Saved ${prospect.name}.`);
  }

  async function changeStatus(prospect: Prospect, next: ProspectStatus) {
    setProspects((current) => current.map((item) => (item.id === prospect.id ? { ...item, status: next } : item)));
    await updateProspectStatus(prospect.id, next);
    setToast(`${prospect.name} moved to ${statusLabels[next]}.`);
  }

  function goToTourStep(index: number) {
    if (index === 0) {
      resetFilters();
      setSort("match_desc");
    }
    const target = tourSteps[index].view;
    if (target) setView(target);
    setTourIndex(index);
  }

  function closeTour() {
    setTourIndex(null);
    try { localStorage.setItem(TOUR_SEEN_KEY, "1"); } catch { /* storage unavailable */ }
    requestAnimationFrame(() => tourButton.current?.focus());
  }

  function resetFilters() {
    setQuery("");
    setFit("all");
    setStatus("all");
  }

  function closeAnalyze() {
    setAnalyzeOpen(false);
    requestAnimationFrame(() => analyzeButton.current?.focus());
  }

  function addAnalysis(prospect: Prospect) {
    setProspects((current) => [prospect, ...current]);
    resetFilters();
    setView("overview");
    closeAnalyze();
    setToast(`Added ${prospect.name} as a synthetic demo record.`);
  }

  const navItems: { id: View; label: string; icon: ReactNode; count?: number }[] = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={15} />, count: prospects.length || undefined },
    { id: "saved", label: "Saved", icon: <Bookmark size={15} />, count: saved.size || undefined },
    { id: "pipeline", label: "Pipeline", icon: <SquareKanban size={15} />, count: activePursuits || undefined },
    { id: "outcomes", label: "Outcomes", icon: <Trophy size={15} /> },
    { id: "profile", label: "Organization profile", icon: <Building2 size={15} /> },
  ];

  const tableProps = { query, setQuery, fit, setFit, status, setStatus, sort, setSort, saved, toggleSave, changeStatus, resetFilters };

  return <div className="app-frame">
    <aside className="app-sidebar">
      <Link href="/" className="app-brand" aria-label="GPI home"><Image src="/gpi-mark.png" alt="" width={28} height={28} priority /><span>GPI</span><span className="app-brand-caption">DEMO</span></Link>
      <div className="workspace-label"><span>WORKSPACE</span></div>
      <div className="workspace-switch"><span className="workspace-avatar">{profile ? initials(profile.name) : "—"}</span><span><b>{profile?.name ?? "Loading…"}</b><small>Fictional nonprofit</small></span></div>
      <p className="side-section-label">PROSPECTING</p>
      <nav className="app-nav" aria-label="Workspace" data-tour="nav">
        {navItems.map((item) => <button type="button" key={item.id} className={view === item.id ? "active" : undefined} aria-current={view === item.id ? "page" : undefined} aria-label={item.label} onClick={() => setView(item.id)}>{item.icon}<span>{item.label}</span>{item.count !== undefined && <small>{item.count}</small>}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-data-links" data-tour="data-links"><Link href="/search"><Compass size={15} />Foundation search</Link><Link href="/platform/foundations"><Database size={15} />IRS dataset explorer</Link></div>
        <Link href="/"><House size={15} />Back to site</Link>
        <div className="signed-in"><span className="signed-avatar">DU</span><span><b>Demo user</b><small>Frontend-only session</small></span></div>
      </div>
    </aside>

    <div className="app-main">
      <header className="app-topbar">
        <div className="breadcrumb"><Link href="/">GPI</Link><span>/</span><span>Workspace</span><span>/</span><b>{viewTitles[view]}</b></div>
        <div className="app-top-actions"><button ref={tourButton} type="button" className="tour-launch" onClick={() => goToTourStep(0)}><CirclePlay size={14} aria-hidden="true" /><span className="tour-label-long">Take the tour</span><span className="tour-label-short">Tour</span></button><span className="demo-badge"><i /> DEMO DATA</span><button type="button" className="icon-button" aria-label="Notifications (demo)" onClick={() => setToast("Notifications are not connected in this demo.")}><Bell size={16} /></button><span className="top-avatar" aria-hidden="true">DU</span></div>
      </header>

      <main className="app-content">
        {loading ? <div className="empty-state" role="status"><span className="loading-mark" /><b>Loading demo workspace…</b><span>Resolving fictional prospects from the mock API.</span></div> : <>
          {view === "overview" && <>
            <div className="dashboard-heading">
              <div><p className="eyebrow">PROSPECT WORKSPACE / DEMO DATA</p><h1>Prospect intelligence</h1><p>Fictional funders ranked against {profile.name}&apos;s mission, geography, and funding need.</p></div>
              <button ref={analyzeButton} type="button" className="button analyze-button" data-tour="analyze" onClick={() => setAnalyzeOpen(true)}><Plus size={14} />Analyze a prospect</button>
            </div>
            <section className="metric-grid" aria-label="Overview metrics (demo data)" data-tour="metrics">
              <div className="metric-card"><span>Prospects analyzed</span><b>{metrics.prospectsAnalyzed.toLocaleString("en-US")}</b><small><i />Demo data</small></div>
              <div className="metric-card metric-fit"><span>High-fit prospects</span><b>{metrics.highFit}</b><small><i />Demo data</small></div>
              <div className="metric-card metric-funding"><span>Potential funding</span><b>{metrics.potentialFunding}</b><small><i />Demo data</small></div>
              <div className="metric-card metric-pursuits"><span>Active pursuits</span><b>{metrics.activePursuits}</b><small><i />Demo data</small></div>
            </section>
            <div className="content-section-title"><div><p className="eyebrow">RANKED PROSPECTS</p><h2>Best-fit funders to review</h2></div></div>
            <ProspectPanel title="Prospects" rows={visible} total={prospects.length} {...tableProps} />
            <div className="dashboard-lower">
              <div className="lower-note"><span className="lower-icon"><ShieldCheck size={15} /></span><div><span className="eyebrow">HUMAN REVIEW</span><b>AI recommends. Fundraisers decide.</b><p>Open a prospect to confirm fit, reduce priority, or reject it.</p></div>{prospects[0] && !isSessionRecord(prospects[0]) && <Link href={`/prospects/${prospects[0].id}`} aria-label={`Review ${prospects[0].name}`}><ArrowLeft size={14} /></Link>}</div>
              <div className="lower-note data-note"><span className="lower-icon"><Database size={15} /></span><div><span className="eyebrow">SEPARATE REAL DATASET</span><b>IRS 990-PF foundation records</b><p>Browse parsed filings, kept apart from this fictional demo.</p></div><Link href="/platform/foundations" aria-label="Open the IRS dataset explorer"><ArrowLeft size={14} /></Link></div>
            </div>
          </>}

          {view === "saved" && <>
            <div className="dashboard-heading"><div><p className="eyebrow">SAVED / DEMO DATA</p><h1>Saved prospects</h1><p>Prospects you bookmarked during this session.</p></div></div>
            <div className="content-section-title" />
            {savedProspects.length === 0
              ? <div className="prospect-panel" data-tour="view-panel"><div className="empty-state"><Bookmark size={20} /><b>No saved prospects yet</b><span>Use the bookmark icon in the overview table to save a prospect.</span><button type="button" className="toolbar-button" onClick={() => setView("overview")}>Go to overview</button></div></div>
              : <div data-tour="view-panel"><ProspectPanel title="Saved" rows={visible} total={savedProspects.length} {...tableProps} /></div>}
          </>}

          {view === "pipeline" && <div className="simple-view">
            <p className="eyebrow">PIPELINE / DEMO DATA</p><h1>Pipeline</h1><p className="simple-intro">Where each fictional prospect sits today. Change a stage from the overview table or a prospect page.</p>
            <div className="outcome-dashboard" data-tour="view-panel">{pipelineStages.map((stage) => {
              const items = prospects.filter((prospect) => prospect.status === stage);
              return <div key={stage}><span>{statusLabels[stage].toUpperCase()}</span><b>{items.length} {items.length === 1 ? "prospect" : "prospects"}</b><small>{items.length ? items.map((item, index) => <span key={item.id}>{index > 0 && " · "}<ProspectName prospect={item} /></span>) : "None yet"}</small></div>;
            })}</div>
          </div>}

          {view === "outcomes" && <div className="simple-view">
            <p className="eyebrow">OUTCOMES / DEMO DATA</p><h1>Outcomes</h1><p className="simple-intro">Recorded results help GPI learn which signals matter to your team. All figures here are fictional.</p>
            <div className="profile-grid" data-tour="view-panel">
              {(["won", "applied", "not_pursued"] as ProspectStatus[]).map((outcome) => {
                const items = prospects.filter((prospect) => prospect.status === outcome);
                return <article key={outcome}><span>{statusLabels[outcome].toUpperCase()}</span><h2>{items.length} {items.length === 1 ? "prospect" : "prospects"}</h2><p>{items.length ? items.map((item, index) => <span key={item.id}>{index > 0 && " · "}<ProspectName prospect={item} /></span>) : "No prospects recorded at this stage."}</p></article>;
              })}
              <article><span>DECISION RATE</span><h2>{prospects.length ? Math.round((prospects.filter((prospect) => ["won", "applied", "not_pursued"].includes(prospect.status)).length / prospects.length) * 100) : 0}%</h2><p>Share of prospects with a recorded application, award, or decision not to pursue.</p></article>
            </div>
          </div>}

          {view === "profile" && <div className="simple-view">
            <p className="eyebrow">ORGANIZATION PROFILE / FICTIONAL</p><h1>{profile.name}</h1><p className="simple-intro">GPI scores prospects against this profile. Editing is not connected in the frontend demo.</p>
            <div className="profile-grid" data-tour="view-panel">
              <article><span>MISSION</span><h2>What we do</h2><p>{profile.mission}</p></article>
              <article><span>GEOGRAPHY</span><h2>Where we work</h2><p>{profile.geography.join(" · ")}</p></article>
              <article><span>FOCUS AREAS</span><h2>Program priorities</h2><p>{profile.focusAreas.join(" · ")}</p></article>
              <article><span>FUNDING NEED</span><h2>Current ask</h2><p>{profile.fundingNeed}</p></article>
            </div>
          </div>}
        </>}
      </main>
    </div>

    {tourIndex !== null && <ProductTour steps={tourSteps} index={tourIndex} onChange={goToTourStep} onClose={closeTour} />}
    {analyzeOpen && <AnalyzeModal onClose={closeAnalyze} onAdded={addAnalysis} />}
    {toast && <div className="toast" role="status"><Check size={15} />{toast}<button type="button" aria-label="Dismiss notification" onClick={() => setToast("")}><X size={15} /></button></div>}
  </div>;
}

function ProspectName({ prospect }: { prospect: Prospect }) {
  if (isSessionRecord(prospect)) return <span>{prospect.name}</span>;
  return <Link href={`/prospects/${prospect.id}`}>{prospect.name}</Link>;
}

interface ProspectPanelProps {
  title: string;
  rows: Prospect[];
  total: number;
  query: string;
  setQuery: (value: string) => void;
  fit: Fit;
  setFit: (value: Fit) => void;
  status: ProspectStatus | "all";
  setStatus: (value: ProspectStatus | "all") => void;
  sort: Sort;
  setSort: (value: Sort) => void;
  saved: Set<string>;
  toggleSave: (prospect: Prospect) => void;
  changeStatus: (prospect: Prospect, status: ProspectStatus) => void;
  resetFilters: () => void;
}

function ProspectPanel({ title, rows, total, query, setQuery, fit, setFit, status, setStatus, sort, setSort, saved, toggleSave, changeStatus, resetFilters }: ProspectPanelProps) {
  return <section className="prospect-panel" aria-label={`${title} table`}>
    <div className="panel-toolbar" data-tour="toolbar">
      <div className="table-title">{title}<small>{rows.length} of {total} shown</small></div>
      <div className="table-actions">
        <label className="table-search"><Search size={13} /><span className="sr-only">Search prospects</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, focus, region" /></label>
        <label className="toolbar-button status-action"><ArrowUpDown size={13} /><span className="sr-only">Sort prospects</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>{(Object.keys(sortLabels) as Sort[]).map((key) => <option key={key} value={key}>{sortLabels[key]}</option>)}</select><ChevronDown size={13} /></label>
      </div>
    </div>
    <div className="filter-row" data-tour="filters">
      <div className="filter-group" role="group" aria-label="Filter by fit">{(Object.keys(fitLabels) as Fit[]).map((key) => <button type="button" key={key} className={fit === key ? "selected" : undefined} aria-pressed={fit === key} onClick={() => setFit(key)}>{fitLabels[key]}</button>)}</div>
      <span className="filter-divider" aria-hidden="true" />
      <div className="filter-group" role="group" aria-label="Filter by status"><button type="button" className={status === "all" ? "selected" : undefined} aria-pressed={status === "all"} onClick={() => setStatus("all")}>All statuses</button>{statuses.map((key) => <button type="button" key={key} className={status === key ? "selected" : undefined} aria-pressed={status === key} onClick={() => setStatus(key)}>{statusLabels[key]}</button>)}</div>
    </div>
    {rows.length === 0
      ? <div className="empty-state"><Search size={20} /><b>No prospects match these filters</b><span>Try a different search, fit band, or status.</span><button type="button" className="toolbar-button" onClick={resetFilters}>Clear filters</button></div>
      : <div className="prospect-table-scroll"><table className="prospect-table">
        <thead><tr><th><span className="sr-only">Save</span></th><th>Foundation</th><th>Match</th><th>Typical grant</th><th>Focus areas</th><th>Geography</th><th>Recent signal</th><th>Status</th></tr></thead>
        <tbody>{rows.map((prospect, index) => {
          const isSaved = saved.has(prospect.id);
          const session = isSessionRecord(prospect);
          const nameContent = <><span className={`foundation-monogram monogram-${index % 4}`} aria-hidden="true">{initials(prospect.name)}</span><span><b>{prospect.name}</b><small>{session ? <><Sparkles size={9} />&nbsp;Session-only analysis</> : <>View intelligence<ArrowLeft size={9} /></>}</small></span></>;
          return <tr key={prospect.id} data-tour={index === 0 ? "row" : undefined}>
            <td><button type="button" className={`save-button${isSaved ? " is-saved" : ""}`} aria-pressed={isSaved} aria-label={isSaved ? `Unsave ${prospect.name}` : `Save ${prospect.name}`} onClick={() => toggleSave(prospect)}>{isSaved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}</button></td>
            <td>{session ? <div className="foundation-name">{nameContent}</div> : <Link className="foundation-name" href={`/prospects/${prospect.id}`} data-tour={index === 0 ? "prospect-link" : undefined}>{nameContent}</Link>}</td>
            <td><div className="match-cell"><span>{prospect.matchScore}%</span><span className="score-track" aria-hidden="true"><i style={{ width: `${prospect.matchScore}%` }} /></span></div></td>
            <td>{grantRange(prospect)}</td>
            <td>{prospect.focusAreas.join(", ")}</td>
            <td>{prospect.geography.join(", ")}</td>
            <td>{prospect.recentSignal ?? <span className="muted">No recent signal</span>}</td>
            <td><select className={`status-select status-${prospect.status}`} aria-label={`Pipeline status for ${prospect.name}`} value={prospect.status} onChange={(event) => changeStatus(prospect, event.target.value as ProspectStatus)}>{statuses.map((key) => <option key={key} value={key}>{statusLabels[key]}</option>)}</select></td>
          </tr>;
        })}</tbody>
      </table></div>}
    <div className="panel-bottom"><span><i />Demo data · fictional organizations and synthetic evidence</span><span>Match scores support, not replace, human judgment.</span></div>
  </section>;
}

function AnalyzeModal({ onClose, onAdded }: { onClose: () => void; onAdded: (prospect: Prospect) => void }) {
  const [name, setName] = useState("");
  const [mission, setMission] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !mission.trim()) return;
    setSubmitting(true);
    const result = await analyzeProspect({ name: name.trim(), mission: mission.trim() });
    onAdded({ ...result, status: "research", recentSignal: "Synthetic analysis created this session" });
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && !submitting) {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialog.current) return;
    const focusable = dialog.current.querySelectorAll<HTMLElement>("button:not([disabled]), input, textarea");
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
    <div ref={dialog} className="analyze-modal" role="dialog" aria-modal="true" aria-labelledby="analyze-title" onKeyDown={onKeyDown}>
      <button type="button" className="modal-close" aria-label="Close" onClick={onClose} disabled={submitting}><X size={18} /></button>
      <p className="eyebrow">FRONTEND DEMO / SYNTHETIC RESULT</p>
      <h2 id="analyze-title">Analyze a prospect</h2>
      <p>Enter a funder name and your mission. The demo returns a synthetic record — no real research is performed.</p>
      <form onSubmit={submit}>
        <label htmlFor="analyze-name">Foundation name</label>
        <input id="analyze-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Canyon Light Foundation" required autoFocus disabled={submitting} />
        <label htmlFor="analyze-mission">Your mission</label>
        <textarea id="analyze-mission" value={mission} onChange={(event) => setMission(event.target.value)} rows={3} placeholder="What does your organization do, and where?" required disabled={submitting} />
        <button type="submit" className="button" disabled={submitting || !name.trim() || !mission.trim()}>{submitting ? <><span className="loading-mark" aria-hidden="true" />Analyzing…</> : <><Sparkles size={14} />Run demo analysis</>}</button>
        {submitting && <span className="sr-only" role="status">Analyzing prospect</span>}
      </form>
    </div>
  </div>;
}
