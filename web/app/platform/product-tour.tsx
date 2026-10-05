"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

export interface TourStep {
  /** Matches a `data-tour` attribute in the workspace. Steps without a target render centered. */
  target?: string;
  eyebrow: string;
  title: string;
  body: ReactNode;
}

interface Rect { top: number; left: number; width: number; height: number }

const PAD = 6;
const MOBILE = 720;

export default function ProductTour({ steps, index, onChange, onClose }: { steps: TourStep[]; index: number; onChange: (index: number) => void; onClose: () => void }) {
  const step = steps[index];
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
  const isLast = index === steps.length - 1;

  // Find the highlighted element, bring it into view, and keep its position in sync.
  useEffect(() => {
    let frame = 0;
    const find = () => (step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null);
    const measure = () => {
      const el = find();
      const box = el?.getBoundingClientRect();
      setRect(box && box.width > 0 && box.height > 0 ? { top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 } : null);
    };
    frame = requestAnimationFrame(() => {
      const el = find();
      if (el && !el.closest(".app-sidebar")) {
        const box = el.getBoundingClientRect();
        const mobile = window.innerWidth < MOBILE;
        const offset = mobile ? 116 : box.height > window.innerHeight * 0.55 ? 90 : (window.innerHeight - box.height) / 2 - 60;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: Math.max(0, window.scrollY + box.top - offset), behavior: reduce ? "auto" : "smooth" });
      }
      measure();
      primary.current?.focus({ preventScroll: true });
    });
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [step]);

  // Place the card beside the highlight once both sizes are known.
  useLayoutEffect(() => {
    const el = card.current;
    if (!el || !rect || window.innerWidth < MOBILE) {
      setCardPos(null);
      return;
    }
    const gap = 14;
    const { innerWidth: vw, innerHeight: vh } = window;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let top = rect.top + rect.height + gap;
    let left = rect.left;
    if (rect.left + rect.width + gap + w < vw && rect.height > vh * 0.45) {
      top = rect.top;
      left = rect.left + rect.width + gap;
    } else if (top + h > vh - 12) {
      top = rect.top - h - gap;
    }
    setCardPos({ top: Math.min(Math.max(12, top), vh - h - 12), left: Math.min(Math.max(12, left), vw - w - 12) });
  }, [rect, index]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    } else if (event.key === "ArrowRight" && !isLast) {
      onChange(index + 1);
    } else if (event.key === "ArrowLeft" && index > 0) {
      onChange(index - 1);
    } else if (event.key === "Tab" && card.current) {
      const focusable = card.current.querySelectorAll<HTMLElement>("button");
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
  }

  const placement = rect ? (cardPos ? "tour-card-anchored" : "tour-card-docked") : "tour-card-centered";

  return <div className="tour-layer" onKeyDown={onKeyDown}>
    <div className={`tour-scrim${rect ? " has-spotlight" : ""}`} onClick={onClose} aria-hidden="true" />
    {rect && <div className="tour-spotlight" aria-hidden="true" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />}
    <div ref={card} className={`tour-card ${placement}`} style={cardPos ?? undefined} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
      <button type="button" className="tour-close" aria-label="Close tour" onClick={onClose}><X size={16} /></button>
      <p className="eyebrow">{step.eyebrow} · {index + 1} / {steps.length}</p>
      <h2 id="tour-title">{step.title}</h2>
      <div id="tour-body" className="tour-body">{step.body}</div>
      <div className="tour-progress" aria-hidden="true"><i style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div>
      <div className="tour-actions">
        {index === 0
          ? <button type="button" className="quiet-link tour-skip" onClick={onClose}>Not now</button>
          : <button type="button" className="toolbar-button" onClick={() => onChange(index - 1)}><ArrowLeft size={13} />Back</button>}
        <button ref={primary} type="button" className="button button-small" onClick={() => (isLast ? onClose() : onChange(index + 1))}>{index === 0 ? "Start the tour" : isLast ? "Finish tour" : "Next"}{!isLast && <ArrowRight size={13} />}</button>
      </div>
      <p className="tour-keys">Use ← → to move, Esc to exit.</p>
    </div>
  </div>;
}
