export const usd = (v: number | string | null | undefined) =>
  v === null || v === undefined ? "n/a" : "$" + Math.round(Number(v)).toLocaleString("en-US");
export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const compactUsd = (v: number) =>
  v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${Math.round(v)}`;
export const yearRange = (years: number[]) => (years.length ? (years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : `${years[0]}`) : "");
