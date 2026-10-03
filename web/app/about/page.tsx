import Link from "next/link";
import { ArrowRight, BookOpenCheck, Fingerprint, Gauge, GitBranch, ShieldCheck } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/app/shared";

const principles = [
  { n: "01", icon: BookOpenCheck, title: "Evidence before automation", text: "Every signal should be inspectable. A score is a starting point, not a substitute for source material." },
  { n: "02", icon: Gauge, title: "Explain the recommendation", text: "Teams need to understand why a prospect appears relevant and where confidence is limited." },
  { n: "03", icon: Fingerprint, title: "Keep humans in control", text: "Fundraising strategy depends on relationships, timing, context, and judgment that cannot be reduced to a score." },
  { n: "04", icon: GitBranch, title: "Learn from outcomes", text: "What teams pursue and what happens next should inform a more useful research queue over time." },
  { n: "05", icon: ShieldCheck, title: "Design for real workflows", text: "Research should move naturally from discovery to review, action, and learning." },
];

export default function AboutPage() {
  return <><SiteHeader /><main className="subpage about-page"><div className="wrap"><div className="subpage-heading"><p className="eyebrow">Why GPI</p><h1>Better fundraising<br />starts with <em>better decisions.</em></h1><p>Nonprofits do not need more tabs, spreadsheets, and unranked lists. They need a way to turn fragmented information into a clear research queue.</p></div><section className="about-statement"><span>THE PRODUCT PHILOSOPHY</span><p>Make the next research decision clearer, more explainable, and easier to learn from.</p></section><section id="methodology" className="principles"><div className="principles-title"><p className="eyebrow">How we build</p><h2>Five principles.<br /><em>One human decision.</em></h2></div><div className="principle-list">{principles.map(({ n, icon: Icon, title, text }) => <article key={n}><span className="principle-number">{n}</span><Icon size={19} /><div><h3>{title}</h3><p>{text}</p></div></article>)}</div></section><section className="partner-context"><span className="eyebrow">DESIGN PARTNER / PILOT CONTEXT</span><h2>Built around how nonprofit teams actually work.</h2><p>GPI has been shaped around real fundraising workflows, including a pilot context focused on strengthening grant prospect research for mission-driven organizations. This language does not imply a public customer or partner endorsement.</p><Link className="text-link" href="/platform">Explore the demo <ArrowRight size={15} /></Link></section></div></main><SiteFooter /></>;
}