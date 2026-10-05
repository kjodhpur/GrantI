"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { extractCriteria } from "@/lib/criteria";
import { MATCHABLE_CAUSES, causeLabel } from "@/lib/taxonomy";
import type { OrganizationProfile } from "@/types/prospect";

type Answers = { name: string; mission: string; focus: string[]; geography: string; ask: string; purpose: string };

const ASKS = ["$10,000", "$25,000", "$50,000", "$100,000", "$250,000", "$500,000"];
const PLACES = ["Nationwide (US)", "International"];
const MIN_FINISH_MS = 2600;   // long enough to read the checklist; results usually arrive sooner

function fromProfile(p: OrganizationProfile | null): Answers {
  const need = p?.fundingNeed ?? "";
  const m = need.match(/^(\$[\d,.]+[kKmM]?)(?:\s+for\s+(.*))?$/);
  return {
    name: p?.name ?? "",
    mission: p?.mission ?? "",
    focus: p?.focusAreas ?? [],
    geography: p?.geography.join(", ") ?? "",
    ask: m ? m[1] : need,
    purpose: m?.[2] ?? "",
  };
}

function toProfile(a: Answers): OrganizationProfile {
  return {
    name: a.name.trim(),
    mission: a.mission.trim(),
    focusAreas: a.focus,
    geography: a.geography.split(",").map((x) => x.trim()).filter(Boolean),
    fundingNeed: [a.ask.trim(), a.purpose.trim() && `for ${a.purpose.trim()}`].filter(Boolean).join(" "),
  };
}

/**
 * One question at a time, then a "we have what we need" screen that stays up while the workspace ranks
 * foundations. `onSubmit` saves the profile and starts ranking; `ready` turns true when results are on hand.
 */
export default function OnboardingWizard({ initial, editing, ready, resultCount, onSubmit, onDone, onClose }: {
  initial: OrganizationProfile | null;
  editing: boolean;
  ready: boolean;
  resultCount: number;
  onSubmit: (profile: OrganizationProfile) => void;
  onDone: () => void;
  onClose?: () => void;
}) {
  const [a, setA] = useState<Answers>(() => fromProfile(initial));
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [finishing, setFinishing] = useState(false);
  const [ticks, setTicks] = useState(0);
  const [minElapsed, setMinElapsed] = useState(false);
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<Answers>) => setA((cur) => ({ ...cur, ...patch }));

  const steps = [
    { key: "name", eyebrow: "ABOUT YOU", title: editing ? "Your organization's name" : "First, what's your organization called?",
      hint: "We'll use it to label your workspace.", valid: a.name.trim().length >= 2 },
    { key: "mission", eyebrow: "YOUR MISSION", title: `What does ${a.name.trim() || "your organization"} do, and for whom?`,
      hint: "A sentence or two is plenty. We read your cause, the people you serve and where you work from it.", valid: a.mission.trim().length >= 10 },
    { key: "focus", eyebrow: "YOUR CAUSES", title: "Which causes are closest to your work?",
      hint: "We picked these from your mission. Pick up to 5; your first pick is your main cause.", valid: true },
    { key: "where", eyebrow: "WHERE YOU WORK", title: "Where do you run your programs?",
      hint: "US states, countries, or both, separated by commas.", valid: true },
    { key: "ask", eyebrow: "YOUR ASK", title: "How much would you typically ask a foundation for?",
      hint: "We compare it with each foundation's usual grant size. You can skip this.", valid: true },
  ] as const;
  const current = steps[step];
  const last = step === steps.length - 1;

  useEffect(() => {
    // steps without a text field focus the card, so Enter still moves on
    requestAnimationFrame(() => (field.current ?? card.current)?.focus());
  }, [step]);

  // finishing: tick the checklist, wait at least MIN_FINISH_MS and for the results, then hand over
  useEffect(() => {
    if (!finishing) return;
    const timers = [1, 2, 3].map((n) => setTimeout(() => setTicks((t) => Math.max(t, n)), n * 650));
    const min = setTimeout(() => setMinElapsed(true), MIN_FINISH_MS);
    return () => { timers.forEach(clearTimeout); clearTimeout(min); };
  }, [finishing]);
  const allDone = finishing && ready && minElapsed;
  useEffect(() => {
    if (!allDone) return;
    const t = setTimeout(onDone, 900);
    return () => clearTimeout(t);
  }, [allDone, onDone]);

  function go(delta: 1 | -1) {
    if (delta === 1 && !current.valid) return;
    if (delta === 1 && last) {
      setFinishing(true);
      onSubmit(toProfile(a));
      return;
    }
    // entering the cause question for the first time: pre-select the causes read from the mission
    if (delta === 1 && steps[step + 1]?.key === "focus" && a.focus.length === 0 && a.mission.trim()) {
      const parsed = extractCriteria(a.mission).causes.map((c) => causeLabel(c.id)).slice(0, 3);
      if (parsed.length) set({ focus: parsed });
    }
    setDir(delta === 1 ? "fwd" : "back");
    setStep((s) => Math.min(steps.length - 1, Math.max(0, s + delta)));
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && onClose && !finishing) { e.stopPropagation(); onClose(); }
    if (e.key === "Enter" && !e.shiftKey && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); go(1); }
  }

  function toggle(label: string) {
    set({ focus: a.focus.includes(label) ? a.focus.filter((x) => x !== label) : a.focus.length < 5 ? [...a.focus, label] : a.focus });
  }

  function addPlace(place: string) {
    const parts = a.geography.split(",").map((x) => x.trim()).filter(Boolean);
    if (!parts.includes(place)) set({ geography: [...parts, place].join(", ") });
  }

  if (finishing) {
    const items = [
      "Profile received",
      "Reading private foundations' IRS 990-PF grant records",
      `Matching ${a.focus.length ? a.focus.slice(0, 2).join(" and ") : "your mission"}${a.geography.trim() ? `, ${a.geography.split(",")[0].trim()}` : ""}`,
      "Ranking your best-fit foundations",
    ];
    const done = allDone;
    const shown = done ? 4 : ticks;
    return <div className="modal-scrim wizard-scrim">
      <div className="wizard-card wizard-finish" role="dialog" aria-modal="true" aria-labelledby="wizard-finish-title" aria-live="polite">
        <div className={`wizard-orb${done ? " is-done" : ""}`} aria-hidden="true">{done ? <Check size={26} /> : <span className="loading-mark" />}</div>
        <p className="eyebrow">{done ? "ALL SET" : "THANK YOU"}</p>
        <h2 id="wizard-finish-title">{done ? `${resultCount} foundations ranked for ${a.name.trim()}` : `Thanks, ${a.name.trim()}. We have what we need.`}</h2>
        <ul className="wizard-checklist">{items.map((item, i) => <li key={item} className={shown > i ? "is-done" : shown === i ? "is-active" : undefined}><span>{shown > i ? <Check size={12} /> : null}</span>{item}</li>)}</ul>
      </div>
    </div>;
  }

  return <div className="modal-scrim wizard-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
    <div ref={card} tabIndex={-1} className="wizard-card" role="dialog" aria-modal="true" aria-labelledby="wizard-title" onKeyDown={onKeyDown}>
      <div className="wizard-top">
        <span className="wizard-count">{step + 1} of {steps.length}</span>
        {onClose && <button type="button" className="wizard-close" aria-label="Close" onClick={onClose}><X size={16} /></button>}
      </div>
      <div className="wizard-progress" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1}><i style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>

      <div key={step} className={`wizard-step wizard-${dir}`}>
        <p className="eyebrow">{current.eyebrow}</p>
        <h2 id="wizard-title">{current.title}</h2>
        <p className="wizard-hint">{current.hint}</p>

        {current.key === "name" && <input ref={field} className="wizard-input" value={a.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Sonoran Family Food Network" aria-labelledby="wizard-title" />}

        {current.key === "mission" && <textarea ref={field} className="wizard-input" rows={4} value={a.mission} onChange={(e) => set({ mission: e.target.value })} placeholder="e.g. We run school meal programs for children in rural Kenya and Uganda." aria-labelledby="wizard-title" />}

        {current.key === "focus" && <div className="wizard-chips" role="group" aria-labelledby="wizard-title">
          {MATCHABLE_CAUSES.map((c) => {
            const at = a.focus.indexOf(c.label);
            return <button type="button" key={c.id} className={at >= 0 ? "selected" : undefined} aria-pressed={at >= 0} onClick={() => toggle(c.label)}>{at === 0 && <b>Main · </b>}{c.label}</button>;
          })}
        </div>}

        {current.key === "where" && <>
          <input ref={field} className="wizard-input" value={a.geography} onChange={(e) => set({ geography: e.target.value })} placeholder="e.g. Arizona, Kenya, Uganda" aria-labelledby="wizard-title" />
          <div className="wizard-chips wizard-chips-small">{PLACES.map((p) => <button type="button" key={p} onClick={() => addPlace(p)}>+ {p}</button>)}</div>
        </>}

        {current.key === "ask" && <>
          <div className="wizard-chips" role="group" aria-label="Typical ask">{ASKS.map((v) => <button type="button" key={v} className={a.ask === v ? "selected" : undefined} aria-pressed={a.ask === v} onClick={() => set({ ask: a.ask === v ? "" : v })}>{v}</button>)}</div>
          <input ref={field} className="wizard-input" value={a.ask} onChange={(e) => set({ ask: e.target.value })} placeholder="Or type an amount, e.g. $30,000" aria-label="Typical ask amount" />
          <input className="wizard-input wizard-input-small" value={a.purpose} onChange={(e) => set({ purpose: e.target.value })} placeholder="What it's for (optional), e.g. a school meals pilot" aria-label="What the funding is for" />
        </>}
      </div>

      <div className="wizard-actions">
        {step > 0 ? <button type="button" className="toolbar-button" onClick={() => go(-1)}><ArrowLeft size={13} />Back</button> : <span />}
        <span className="wizard-enter" aria-hidden="true">press Enter ↵</span>
        <button type="button" className="button" disabled={!current.valid} onClick={() => go(1)}>
          {last ? (editing ? "Update my matches" : "Find my foundations") : current.key === "ask" && !a.ask.trim() ? "Skip" : "Continue"}<ArrowRight size={14} />
        </button>
      </div>
    </div>
  </div>;
}
