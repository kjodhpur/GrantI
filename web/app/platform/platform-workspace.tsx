"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowUpDown, Bell, Bookmark, BookmarkCheck, Building2, Check, ChevronDown, CirclePlay, Compass, Database, House, LayoutDashboard, Plus, Search, ShieldCheck, Sparkles, SquareKanban, Trophy, X } from "lucide-react";
import { analyzeProspect, getDashboardMetrics, getMatchSummary, getOrganizationProfile, getProspects, getSavedIds, saveOrganizationProfile, saveProspect, updateProspectStatus } from "@/lib/api";
import { MATCHABLE_CAUSES } from "@/lib/taxonomy";
import type { OrganizationProfile, Prospect, ProspectStatus } from "@/types/prospect";
import OnboardingWizard from "./onboarding-wizard";
import ProductTour, { type TourStep } from "./product-tour";

type View = "overview" | "saved" | "pipeline" | "outcomes" | "profile";
type Fit = "all" | "high" | "good" | "exploratory";
type Sort = "match_desc" | "match_asc" | "grant_desc" | "name";
type Metrics = Awaited<ReturnType<typeof getDashboardMetrics>>;
type Summary = Awaited<ReturnType<typeof getMatchSummary>>;

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
  { eyebrow: "PRODUCT TOUR", title: "Welcome to GPI", view: "overview", body: <><p>GPI helps your fundraising team find the foundations most likely to fund your work, explains why each one fits, and keeps your team in charge of every decision.</p><p>This two-minute tour walks through the whole platform. The foundations, scores and grants come from public IRS Form 990-PF filings; your profile, saved list and pipeline stay in this browser.</p></> },
  { target: "nav", view: "overview", eyebrow: "WORKSPACE", title: "Five views, one workspace", body: <><p>Move between the parts of your prospecting workflow here:</p><ul><li><b>Overview:</b> ranked prospects and headline numbers</li><li><b>Saved:</b> funders you bookmarked</li><li><b>Pipeline:</b> where every prospect stands</li><li><b>Outcomes:</b> what you applied for and won</li><li><b>Organization profile:</b> what GPI matches against</li></ul></> },
  { target: "metrics", view: "overview", eyebrow: "OVERVIEW", title: "Your prospecting at a glance", body: <p>How many funders GPI has analyzed for you, how many are a high fit, the potential funding they represent, and how many you are actively pursuing. Each card says how its number is calculated.</p> },
  { target: "analyze", view: "overview", eyebrow: "ANALYZE", title: "Check any funder on demand", body: <p>Heard about a foundation from a board member? Enter its name, and GPI finds its IRS filings, scores it against your profile and adds it to your list.</p> },
  { target: "toolbar", view: "overview", eyebrow: "SEARCH & SORT", title: "Find the right funder fast", body: <p>Search by foundation name, focus area, or region. Sort by best match, lowest match, largest typical grant, or name to plan your week.</p> },
  { target: "filters", view: "overview", eyebrow: "FILTERS", title: "Focus on the best fits", body: <><p><b>Fit bands</b> group prospects by match score: High fit (85+), Good fit (75–84) and Exploratory (under 75).</p><p><b>Status filters</b> show only prospects at a given stage, such as everything still in Research.</p></> },
  { target: "row", view: "overview", eyebrow: "RANKED PROSPECTS", title: "Every prospect, scored and explained", body: <><p>Each row shows the <b>match score</b>, the funder&apos;s typical grant range, focus areas, geography and any recent signal.</p><p>Use the <b>bookmark</b> to save a prospect and the <b>status menu</b> to move it through your pipeline. Changes appear across every view.</p></> },
  { target: "prospect-link", view: "overview", eyebrow: "PROSPECT INTELLIGENCE", title: "Open a funder for the full story", body: <><p>Click any foundation name to see its intelligence page:</p><ul><li>A plain-language <b>match summary</b></li><li><b>Why it matches:</b> mission, geography, giving pattern and grant size, each with a confidence level</li><li><b>Evidence</b> from filings and grant history, plus giving trends</li><li>A <b>recommended next action</b> and a printable brief</li></ul></> },
  { target: "prospect-link", view: "overview", eyebrow: "HUMAN REVIEW", title: "AI recommends. Your team decides.", body: <p>On every prospect page your team can <b>confirm fit</b>, <b>reduce priority</b>, or <b>reject</b> a recommendation and add a note. GPI is a decision-support tool: always verify the sources before acting.</p> },
  { target: "view-panel", view: "saved", eyebrow: "SAVED", title: "Your shortlist in one place", body: <p>Everything you bookmark collects here, with the same search, filters and status controls as the overview, so you can work from a short list.</p> },
  { target: "view-panel", view: "pipeline", eyebrow: "PIPELINE", title: "See where every prospect stands", body: <p>Prospects move from <b>Research</b> to <b>Shortlist</b>, <b>Outreach</b>, <b>Applied</b> and <b>Won</b>. Click any name to jump straight to its intelligence page.</p> },
  { target: "view-panel", view: "outcomes", eyebrow: "OUTCOMES", title: "Learn from every result", body: <p>Track what you won, what is awaiting a decision, and what you chose not to pursue. Recording outcomes helps GPI learn which signals matter to your team.</p> },
  { target: "view-panel", view: "profile", eyebrow: "ORGANIZATION PROFILE", title: "What GPI matches against", body: <p>Your mission, geography, focus areas and funding need. Every match score is calculated against this profile: edit it here and the list re-ranks.</p> },
  { target: "data-links", view: "overview", eyebrow: "REAL DATA", title: "Explore real IRS foundation data", body: <><p><b>Foundation search</b> ranks real private foundations from public IRS Form 990-PF filings using your mission, location and ask.</p><p>The <b>IRS dataset explorer</b> lets you browse the underlying foundation records directly.</p></> },
  { view: "overview", eyebrow: "YOU'RE READY", title: "That's the platform", body: <><p>Start with your highest-fit prospects, open one to review the evidence, and record your decision. You can replay this tour any time with the <b>Take the tour</b> tab at the top right.</p></> },
];

const viewTitles: Record<View, string> = { overview: "Overview", saved: "Saved prospects", pipeline: "Pipeline", outcomes: "Outcomes", profile: "Organization profile" };
const k = (v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);
const grantRange = (prospect: Prospect) => (prospect.typicalGrantMax ? `${k(prospect.typicalGrantMin)} – ${k(prospect.typicalGrantMax)}` : "Not enough data");
const isSessionRecord = (prospect: Prospect) => prospect.id.startsWith("analysis-");
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();

export default function PlatformWorkspace() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [summary, setSummary] = useState<Summary>(null);
  const [phase, setPhase] = useState<"loading" | "setup" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  // the question-by-question profile wizard: open on a first visit (no profile yet) and when editing
  const [wizard, setWizard] = useState<"closed" | "first" | "edit">("closed");
  const wizardOpen = useRef(false);
  wizardOpen.current = wizard !== "closed";
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
    (async () => {
      const nextProfile = await getOrganizationProfile();
      if (!active) return;
      setProfile(nextProfile);
      setSaved(new Set(getSavedIds()));
      if (!nextProfile) { setPhase("setup"); setWizard("first"); return; }
      setPhase("loading");
      try {
        const [nextMetrics, nextProspects, nextSummary] = await Promise.all([getDashboardMetrics(), getProspects(), getMatchSummary()]);
        if (!active) return;
        setMetrics(nextMetrics);
        setProspects(nextProspects);
        setSummary(nextSummary);
        setPhase("ready");
        if (!wizardOpen.current) offerTour();   // after the wizard, offerTour runs when it closes
      } catch (e) {
        if (!active) return;
        setError((e as Error).message);
        setPhase("error");
      }
    })();
    return () => { active = false; };
  }, [reloadKey]);

  // Offer the tour once rankings are on screen: on a first visit, or always when linked with ?tour=1.
  function offerTour() {
    let seen = false;
    try { seen = localStorage.getItem(TOUR_SEEN_KEY) === "1"; } catch { /* storage unavailable */ }
    if (!seen || new URLSearchParams(window.location.search).get("tour") === "1") setTourIndex(0);
  }

  async function submitProfile(next: OrganizationProfile) {
    setPhase("loading");          // the wizard's closing screen waits for the new rankings
    await saveOrganizationProfile(next);
    setReloadKey((count) => count + 1);
  }

  function wizardDone() {
    const first = wizard === "first";
    setWizard("closed");
    setView("overview");
    if (first) offerTour();
    else setToast("Profile updated and foundations re-ranked.");
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const loading = phase === "loading";
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
    await saveProspect(prospect.id, !wasSaved);
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
    setProspects((current) => [prospect, ...current.filter((item) => item.id !== prospect.id)]);
    resetFilters();
    setView("overview");
    closeAnalyze();
    setToast(`${prospect.name}: ${prospect.matchScore}% match against your profile.`);
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
      <Link href="/" className="app-brand" aria-label="GPI home"><Image src="/gpi-mark.png" alt="" width={28} height={28} priority /><span>GPI</span><span className="app-brand-caption">BETA</span></Link>
      <div className="workspace-label"><span>WORKSPACE</span></div>
      <div className="workspace-switch"><span className="workspace-avatar">{profile ? initials(profile.name) : "—"}</span><span><b>{profile?.name ?? "Set up your profile"}</b><small>Your organization</small></span></div>
      <p className="side-section-label">PROSPECTING</p>
      <nav className="app-nav" aria-label="Workspace" data-tour="nav">
        {navItems.map((item) => <button type="button" key={item.id} className={view === item.id ? "active" : undefined} aria-current={view === item.id ? "page" : undefined} aria-label={item.label} onClick={() => setView(item.id)}>{item.icon}<span>{item.label}</span>{item.count !== undefined && <small>{item.count}</small>}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-data-links" data-tour="data-links"><Link href="/search"><Compass size={15} />Foundation search</Link><Link href="/platform/foundations"><Database size={15} />IRS dataset explorer</Link></div>
        <Link href="/"><House size={15} />Back to site</Link>
        <div className="signed-in"><span className="signed-avatar">{profile ? initials(profile.name) : "—"}</span><span><b>This browser</b><small>Profile and pipeline saved locally</small></span></div>
      </div>
    </aside>

    <div className="app-main">
      <header className="app-topbar">
        <div className="breadcrumb"><Link href="/">GPI</Link><span>/</span><span>Workspace</span><span>/</span><b>{viewTitles[view]}</b></div>
        <div className="app-top-actions"><button ref={tourButton} type="button" className="tour-launch" onClick={() => goToTourStep(0)}><CirclePlay size={14} aria-hidden="true" /><span className="tour-label-long">Take the tour</span><span className="tour-label-short">Tour</span></button><span className="demo-badge"><i /> IRS 990-PF DATA</span><button type="button" className="icon-button" aria-label="Notifications" onClick={() => setToast("Notifications are not available yet.")}><Bell size={16} /></button><span className="top-avatar" aria-hidden="true">{profile ? initials(profile.name) : "—"}</span></div>
      </header>

      <main className="app-content">
        {phase === "setup" ? <div className="empty-state wizard-backdrop"><span className="loading-mark" /><b>Tell us about your organization</b><span>A few quick questions, then GPI ranks private foundations from their IRS 990-PF filings.</span><button type="button" className="toolbar-button" onClick={() => setWizard("first")}>Start</button></div>
        : phase === "error" ? <div className="empty-state" role="alert"><X size={20} /><b>Could not load rankings</b><span>{error}</span><button type="button" className="toolbar-button" onClick={() => setReloadKey((count) => count + 1)}>Try again</button></div>
        : loading || !metrics || !profile ? <div className="empty-state" role="status"><span className="loading-mark" /><b>Ranking foundations…</b><span>Scoring private foundations&apos; IRS 990-PF giving against your profile.</span></div>
        : <>
          {view === "overview" && <>
            <div className="dashboard-heading">
              <div><p className="eyebrow">PROSPECT WORKSPACE / IRS 990-PF FILINGS</p><h1>Prospect intelligence</h1><p>Private foundations ranked against {profile.name}&apos;s mission, geography, and funding need, from their public IRS Form 990-PF grant records.</p>{summary && <CriteriaLine summary={summary} />}</div>
              <button ref={analyzeButton} type="button" className="button analyze-button" data-tour="analyze" onClick={() => setAnalyzeOpen(true)}><Plus size={14} />Analyze a prospect</button>
            </div>
            <section className="metric-grid" aria-label="Overview metrics" data-tour="metrics">
              <div className="metric-card"><span>Foundations scored</span><b>{metrics.prospectsAnalyzed.toLocaleString("en-US")}</b><small><i />Most focused on your causes</small></div>
              <div className="metric-card metric-fit"><span>High-fit prospects</span><b>{metrics.highFit}</b><small><i />Score 85+ in your top {prospects.length}</small></div>
              <div className="metric-card metric-funding"><span>Potential funding</span><b>{metrics.potentialFunding}</b><small><i />Median grant of each 75+ prospect</small></div>
              <div className="metric-card metric-pursuits"><span>Active pursuits</span><b>{metrics.activePursuits}</b><small><i />Shortlist, outreach, applied</small></div>
            </section>
            <div className="content-section-title"><div><p className="eyebrow">RANKED PROSPECTS</p><h2>Best-fit funders to review</h2></div></div>
            <ProspectPanel title="Prospects" rows={visible} total={prospects.length} {...tableProps} />
            <div className="dashboard-lower">
              <div className="lower-note"><span className="lower-icon"><ShieldCheck size={15} /></span><div><span className="eyebrow">HUMAN REVIEW</span><b>AI recommends. Fundraisers decide.</b><p>Open a prospect to confirm fit, reduce priority, or reject it.</p></div>{prospects[0] && !isSessionRecord(prospects[0]) && <Link href={`/prospects/${prospects[0].id}`} aria-label={`Review ${prospects[0].name}`}><ArrowLeft size={14} /></Link>}</div>
              <div className="lower-note data-note"><span className="lower-icon"><Database size={15} /></span><div><span className="eyebrow">SOURCE DATA</span><b>IRS 990-PF foundation records</b><p>Browse each foundation&apos;s latest filing, the data these rankings come from.</p></div><Link href="/platform/foundations" aria-label="Open the IRS dataset explorer"><ArrowLeft size={14} /></Link></div>
            </div>
          </>}

          {view === "saved" && <>
            <div className="dashboard-heading"><div><p className="eyebrow">SAVED</p><h1>Saved prospects</h1><p>Prospects you bookmarked, kept in this browser.</p></div></div>
            <div className="content-section-title" />
            {savedProspects.length === 0
              ? <div className="prospect-panel" data-tour="view-panel"><div className="empty-state"><Bookmark size={20} /><b>No saved prospects yet</b><span>Use the bookmark icon in the overview table to save a prospect.</span><button type="button" className="toolbar-button" onClick={() => setView("overview")}>Go to overview</button></div></div>
              : <div data-tour="view-panel"><ProspectPanel title="Saved" rows={visible} total={savedProspects.length} {...tableProps} /></div>}
          </>}

          {view === "pipeline" && <div className="simple-view">
            <p className="eyebrow">PIPELINE</p><h1>Pipeline</h1><p className="simple-intro">Where each prospect sits today. Change a stage from the overview table or a prospect page.</p>
            <div className="outcome-dashboard" data-tour="view-panel">{pipelineStages.map((stage) => {
              const items = prospects.filter((prospect) => prospect.status === stage);
              return <div key={stage}><span>{statusLabels[stage].toUpperCase()}</span><b>{items.length} {items.length === 1 ? "prospect" : "prospects"}</b><small>{items.length ? items.map((item, index) => <span key={item.id}>{index > 0 && " · "}<ProspectName prospect={item} /></span>) : "None yet"}</small></div>;
            })}</div>
          </div>}

          {view === "outcomes" && <div className="simple-view">
            <p className="eyebrow">OUTCOMES</p><h1>Outcomes</h1><p className="simple-intro">Recorded results help GPI learn which signals matter to your team. Stages are saved in this browser.</p>
            <div className="profile-grid" data-tour="view-panel">
              {(["won", "applied", "not_pursued"] as ProspectStatus[]).map((outcome) => {
                const items = prospects.filter((prospect) => prospect.status === outcome);
                return <article key={outcome}><span>{statusLabels[outcome].toUpperCase()}</span><h2>{items.length} {items.length === 1 ? "prospect" : "prospects"}</h2><p>{items.length ? items.map((item, index) => <span key={item.id}>{index > 0 && " · "}<ProspectName prospect={item} /></span>) : "No prospects recorded at this stage."}</p></article>;
              })}
              <article><span>DECISION RATE</span><h2>{prospects.length ? Math.round((prospects.filter((prospect) => ["won", "applied", "not_pursued"].includes(prospect.status)).length / prospects.length) * 100) : 0}%</h2><p>Share of prospects with a recorded application, award, or decision not to pursue.</p></article>
            </div>
          </div>}

          {view === "profile" && <div className="simple-view">
            <p className="eyebrow">ORGANIZATION PROFILE</p><h1>{profile.name}</h1><p className="simple-intro">GPI scores prospects against this profile. It is saved in this browser.</p>
            <div className="profile-grid" data-tour="view-panel">
              <article><span>MISSION</span><h2>What we do</h2><p>{profile.mission}</p></article>
              <article><span>GEOGRAPHY</span><h2>Where we work</h2><p>{profile.geography.join(" · ") || "Read from your mission"}</p></article>
              <article><span>FOCUS AREAS</span><h2>Program priorities</h2><p>{profile.focusAreas.join(" · ") || "Read from your mission"}</p></article>
              <article><span>FUNDING NEED</span><h2>Current ask</h2><p>{profile.fundingNeed || "Not set"}</p></article>
            </div>
            <div className="profile-form-actions"><button type="button" className="button" onClick={() => setWizard("edit")}><Building2 size={14} />Edit profile</button></div>
          </div>}
        </>}
      </main>
    </div>

    {wizard !== "closed" && <OnboardingWizard key={wizard} initial={wizard === "edit" ? profile : null} editing={wizard === "edit"}
      ready={phase === "ready"} resultCount={prospects.length} onSubmit={submitProfile} onDone={wizardDone}
      onClose={wizard === "edit" ? () => setWizard("closed") : undefined} />}
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
    <div className="panel-bottom"><span><i />IRS Form 990-PF filings, 2019–2026 · cause labels are estimates</span><span>Match scores support, not replace, human judgment.</span></div>
  </section>;
}

function AnalyzeModal({ onClose, onAdded }: { onClose: () => void; onAdded: (prospect: Prospect) => void }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const dialog = useRef<HTMLDivElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setMessage("");
    try {
      const result = await analyzeProspect({ name: name.trim() });
      if (result) onAdded(result);
      else setMessage(`No private foundation named like "${name.trim()}" in the IRS 990-PF filings.`);
    } catch (e) {
      setMessage((e as Error).message);
    }
    setSubmitting(false);
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
      <p className="eyebrow">IRS 990-PF LOOKUP</p>
      <h2 id="analyze-title">Analyze a prospect</h2>
      <p>Enter a private foundation&apos;s name. GPI finds its IRS 990-PF filings and scores it against your organization profile.</p>
      <form onSubmit={submit}>
        <label htmlFor="analyze-name">Foundation name</label>
        <input id="analyze-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Lilly Endowment" required autoFocus disabled={submitting} />
        <button type="submit" className="button" disabled={submitting || name.trim().length < 2}>{submitting ? <><span className="loading-mark" aria-hidden="true" />Analyzing…</> : <><Sparkles size={14} />Analyze</>}</button>
        {message && <p role="alert">{message}</p>}
        {submitting && <span className="sr-only" role="status">Analyzing prospect</span>}
      </form>
    </div>
  </div>;
}

function CriteriaLine({ summary }: { summary: NonNullable<Summary> }) {
  const { criteria, warnings } = summary;
  const parts = [
    criteria.causes.length ? criteria.causes.map((c) => MATCHABLE_CAUSES.find((x) => x.id === c.id)?.label ?? c.id).join(", ") : "",
    criteria.states.length ? criteria.states.join(", ") : "",
    criteria.international ? "international" : "",
    criteria.askUsd ? `ask ${k(criteria.askUsd)}` : "",
  ].filter(Boolean);
  return <p className="criteria-line"><small>Matched on: {parts.join(" · ") || "no cause or geography found in your profile"}{criteria.requireOpen ? " · open to applications only" : ""}</small>{warnings.map((w) => <small key={w}><br />{w}</small>)}</p>;
}
