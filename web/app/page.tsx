"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CircleDot, Database, Fingerprint, ScanSearch, Sparkles } from "lucide-react";
import { useState } from "react";
import { SiteFooter, SiteHeader } from "@/app/shared";

const steps = [
  { number: "01", title: "Understand your organization", copy: "Mission, geography, programs, and funding needs create the context for every recommendation.", icon: Fingerprint, detail: "Organization profile" },
  { number: "02", title: "Build the prospect universe", copy: "Structured foundation records become a usable landscape instead of another unranked spreadsheet.", icon: Database, detail: "Prospect universe" },
  { number: "03", title: "Rank by fit", copy: "Compare mission alignment, giving patterns, geography, award size, and the signals available.", icon: ScanSearch, detail: "Fit signals" },
  { number: "04", title: "Explain the recommendation", copy: "See the evidence behind the score, then bring human judgment to the decision.", icon: Sparkles, detail: "Evidence brief" },
];

const problems = [
  { number: "01", title: "Too much data", text: "Thousands of potential funders. Too little time to investigate every one.", accent: "violet" },
  { number: "02", title: "Too little context", text: "Historic filings can be valuable, but often arrive months after decisions were made.", accent: "blue" },
  { number: "03", title: "Too much manual work", text: "Teams open tabs, read PDFs, compare histories, and rebuild the same research.", accent: "cyan" },
];

export default function Home() {
  const reduceMotion = useReducedMotion();
  const [activeStep, setActiveStep] = useState(0);
  const [spot, setSpot] = useState({ x: 65, y: 46 });
  const active = steps[activeStep];
  const ActiveIcon = active.icon;

  function moveSpot(event: React.MouseEvent<HTMLElement>) {
    if (window.matchMedia("(pointer: fine)").matches) {
      const bounds = event.currentTarget.getBoundingClientRect();
      setSpot({ x: ((event.clientX - bounds.left) / bounds.width) * 100, y: ((event.clientY - bounds.top) / bounds.height) * 100 });
    }
  }

  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero" onMouseMove={moveSpot} style={{ "--pointer-x": `${spot.x}%`, "--pointer-y": `${spot.y}%` } as React.CSSProperties}>
          <div className="hero-grid" aria-hidden="true" />
          <div className="hero-signal signal-one" aria-hidden="true" /><div className="hero-signal signal-two" aria-hidden="true" /><div className="hero-signal signal-three" aria-hidden="true" />
          <div className="wrap hero-content">
            <div className="hero-copy">
              <motion.p className="eyebrow hero-eyebrow" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.65 }}><span className="live-dot" /> Grant prospect intelligence</motion.p>
              <h1><span className="headline-mask"><motion.span initial={{ y: "110%" }} animate={{ y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.75, delay: reduceMotion ? 0 : 0.25 }}>Open the door</motion.span></span><span className="headline-mask"><motion.span initial={{ y: "110%" }} animate={{ y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.75, delay: reduceMotion ? 0 : 0.38 }}>to better-fit <em>funding.</em></motion.span></span></h1>
                            <h1><span className="headline-mask"><motion.span initial={{ y: "110%" }} animate={{ y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.75, delay: reduceMotion ? 0 : 0.25 }}>Open the door</motion.span></span><span className="headline-mask headline-nowrap"><motion.span initial={{ y: "110%" }} animate={{ y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.75, delay: reduceMotion ? 0 : 0.38 }}>to better-fit <em>funding.</em></motion.span></span></h1>
              <motion.p className="hero-intro" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: reduceMotion ? 0 : 0.8 }}>Turn fragmented foundation data into a prioritized list of funders, ranked by fit and supported by evidence.</motion.p>
              <motion.div className="hero-actions" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.98 }}>
                <Link className="button" href="/platform">Explore the platform <ArrowRight size={16} /></Link>
                <a className="text-link" href="#how-it-works">See how it works <ArrowDown size={15} /></a>
              </motion.div>
              <motion.p className="hero-trust" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduceMotion ? 0 : 1.15 }}>Built for fundraising teams that need evidence, not another list.</motion.p>
            </div>
            <div className="hero-mark-wrap" aria-label="GPI open doorway mark">
              <div className="door-light" aria-hidden="true" />
              <div className="door-rings" aria-hidden="true" />
              <motion.div className="hero-mark" initial={{ opacity: 0, scale: 0.94, y: 5 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 1, delay: reduceMotion ? 0 : 0.08, ease: [0.2, 0.75, 0.25, 1] }}>
                <Image src="/gpi-mark.png" alt="" fill priority sizes="(max-width: 800px) 76vw, 40vw" />
              </motion.div>
              <div className="mark-caption"><span>GPI</span><span>Opportunity, in focus</span></div>
            </div>
          </div>
          <div className="hero-bottom wrap"><span>01 — THE OPEN DOOR</span><span>Scroll to explore <ArrowDown size={13} /></span></div>
        </section>

        <section className="flow-strip" aria-label="From foundation data to fundraising intelligence">
          <div className="wrap flow-inner"><p>From raw foundation data to actionable fundraising intelligence.</p><div className="flow-track">{["990-PF DATA", "FRESH SIGNALS", "AI MATCHING", "HUMAN REVIEW", "OUTCOMES"].map((item, i) => <span key={item} className="flow-node"><b>{String(i + 1).padStart(2, "0")}</b>{item}{i < 4 && <i aria-hidden="true" />}</span>)}</div></div>
        </section>

        <section className="section problem-section">
          <div className="section-grid" aria-hidden="true" />
          <div className="wrap">
            <div className="section-heading reveal"><p className="eyebrow">The fundraising research gap</p><h2>Grant research has<br />a <em>data problem.</em></h2><p className="section-lead">The information exists. Turning it into a confident next step is the hard part.</p></div>
            <div className="problem-grid">{problems.map((problem, index) => <motion.article key={problem.number} className={`problem-item problem-${problem.accent}`} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.55, delay: reduceMotion ? 0 : index * 0.1 }}><span className="problem-number">{problem.number}<span /></span><div><h3>{problem.title}</h3><p>{problem.text}</p></div><ArrowUpRight className="problem-arrow" size={19} /></motion.article>)}</div>
          </div>
        </section>

        <section id="how-it-works" className="section workflow-section">
          <div className="wrap"><div className="section-heading"><p className="eyebrow">A clearer path through the data</p><h2>Research becomes<br />a <em>ranked decision.</em></h2><p className="section-lead">A four-step intelligence layer that helps teams see where to look and why.</p></div>
            <div className="workflow-layout">
              <div className="workflow-visual-wrap"><div className="workflow-visual"><div className="visual-topline"><span>INTELLIGENCE LAYER</span><span className="visual-live"><i /> ACTIVE</span></div><div className="visual-center"><div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" /><div className="visual-icon"><ActiveIcon size={29} strokeWidth={1.4} /></div><div className="visual-signals"><span /><span /><span /><span /><span /></div></div><div className="visual-label"><span>{active.number} / 04</span><b>{active.detail}</b></div><div className="visual-foot"><span>PROFILE</span><i /><span>FIT</span><i /><span>EVIDENCE</span></div></div></div>
              <div className="workflow-steps">{steps.map((step, index) => <article key={step.number} className={`workflow-step${activeStep === index ? " active" : ""}`} onMouseEnter={() => setActiveStep(index)} onFocus={() => setActiveStep(index)} tabIndex={0}><span className="step-number">{step.number}</span><div><h3>{step.title}</h3><p>{step.copy}</p></div><span className="step-check">{activeStep === index ? <CircleDot size={17} /> : <Check size={16} />}</span></article>)}</div>
            </div>
          </div>
        </section>

        <section id="intelligence" className="section product-section">
          <div className="wrap product-band"><div className="product-copy"><p className="eyebrow">A working product, not a static mockup</p><h2>See the intelligence,<br />not just the <em>score.</em></h2><p>Search a fictional prospect universe, save opportunities, update pipeline status, and inspect the evidence behind each recommendation.</p><Link className="button" href="/platform">Open interactive demo <ArrowRight size={16} /></Link><span className="demo-note"><i /> Demo data throughout</span></div>
            <div className="mini-dashboard" aria-label="Preview of the GPI product dashboard"><div className="mini-top"><div><Image src="/gpi-mark.png" alt="" width={21} height={21} /><b>GPI</b></div><span>DEMO ENVIRONMENT</span></div><div className="mini-body"><div className="mini-rail"><span className="rail-active"><ScanSearch size={15} /></span><span><Database size={15} /></span><span><Fingerprint size={15} /></span></div><div className="mini-main"><div className="mini-welcome"><div><span>GOOD MORNING</span><h3>Prospect overview</h3></div><span className="mini-period">This quarter⌄</span></div><div className="mini-stats">{[["248", "ANALYZED"], ["37", "HIGH FIT"], ["$4.8M", "POTENTIAL"]].map(([number, label]) => <div key={label}><b>{number}</b><span>{label}</span></div>)}</div><div className="mini-table"><div className="mini-table-head"><span>FOUNDATION</span><span>FIT</span><span>STATUS</span></div>{[["Horizon Impact Foundation", "91", "SHORTLIST"], ["Northstar Community Trust", "87", "RESEARCH"], ["BrightBridge Foundation", "82", "OUTREACH"]].map(([name, score, status], i) => <div className="mini-row" key={name}><span><i className={`mini-avatar avatar-${i}`} />{name}</span><b>{score}<small>%</small></b><em>{status}</em></div>)}</div></div></div><div className="mini-foot"><span><i /> Showing synthetic sample records</span><span>View all prospects <ArrowRight size={12} /></span></div></div>
          </div>
        </section>

        <section className="section outcome-section"><div className="wrap outcome-layout"><div className="section-heading"><p className="eyebrow">The outcome loop</p><h2>Every decision makes<br />the system <em>more useful.</em></h2><p className="section-lead">Most tools stop after search. GPI is designed to learn from the choices fundraising teams actually make.</p></div><div className="outcome-flow">{["Recommended", "Reviewed", "Pursued", "Outcome", "Learn"].map((item, index) => <div className="outcome-node" key={item}><span className={`outcome-dot dot-${index}`}><i /></span><b>{item}</b>{index < 4 && <span className="outcome-connector" />}</div>)}</div></div></section>

        <section className="section signal-section"><div className="wrap signal-layout"><div><p className="eyebrow">Designed for better context</p><h2>Historic data is the foundation.<br /><em>Fresh signals add context.</em></h2><p className="section-lead">Designed to combine durable historical data with more current public signals.</p><div className="planned-note"><CircleDot size={15} /> Product architecture / planned intelligence sources</div></div><div className="signal-layers"><div className="layer-card"><span>01 / FOUNDATION LAYER</span><h3>Durable records</h3><p>990-PF filings · grant history · giving ranges · location · focus areas</p><div className="layer-lines"><i /><i /><i /><i /></div></div><div className="signal-sweep" /><div className="layer-card layer-fresh"><span>02 / SIGNAL LAYER</span><h3>Current context</h3><p>Program updates · leadership news · new initiatives · public announcements</p><div className="signal-bars"><i /><i /><i /></div></div></div></div></section>

        <section className="human-section"><div className="wrap human-layout"><div><p className="eyebrow">Decision support, by design</p><h2>AI recommends.<br /><em>Fundraisers decide.</em></h2><p>GPI is built to accelerate research and prioritization while keeping the final judgment with the fundraising team.</p></div><div className="human-flow"><div><Sparkles size={17} /><span>AI LAYER</span><b>Rank, summarize,<br />surface evidence</b></div><ArrowRight size={18} /><div><Fingerprint size={17} /><span>HUMAN REVIEW</span><b>Strategy, timing,<br />and relationships</b></div></div></div></section>

        <section className="partner-note"><div className="wrap partner-inner"><span>DESIGN PARTNER / PILOT CONTEXT</span><p>Shaped around real nonprofit fundraising workflows, including a pilot context focused on strengthening grant prospect research.</p><Link href="/about">Our approach <ArrowUpRight size={15} /></Link></div></section>
        <section className="closing-cta"><div className="wrap closing-inner"><div><span className="eyebrow">A better place to begin</span><h2>Make the next<br />prospect <em>count.</em></h2></div><Link className="button" href="/platform">Explore GPI <ArrowRight size={16} /></Link></div></section>
      </main>
      <SiteFooter />
    </>
  );
}
