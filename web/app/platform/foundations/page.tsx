import Link from "next/link";
import { listFoundationNames, listFoundations, type Foundation } from "@/lib/db";
import FoundationSearch from "@/app/foundation-search";

export const dynamic = "force-dynamic";

const usd = (value: string | number) => Number(value).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function FoundationsPage({ searchParams }: PageProps<"/platform/foundations">) {
  const params = await searchParams;
  const openOnly = params.open === "1";
  const query = (typeof params.q === "string" ? params.q : "").trim();
  let rows: Foundation[] = [];
  let names: string[] = [];
  let error: string | null = null;
  try {
    [rows, names] = await Promise.all([listFoundations(openOnly, query), listFoundationNames(openOnly)]);
  } catch (cause) {
    error = (cause as Error).message === "NO_DB"
      ? "DATABASE_URL is not set. Configure web/.env.local using docs/02-LOCAL-SETUP.md."
      : `Database error: ${(cause as Error).message}. Load the Postgres dataset to continue.`;
  }

  return <main className="foundation-browser"><header><Link href="/platform" className="foundation-back">← Workspace</Link><span className="demo-badge"><i /> IRS DATA VIEW</span></header><div className="foundation-browser-inner"><p className="eyebrow">REAL DATASET / 990-PF</p><h1>Foundation records</h1><p className="foundation-intro">Explore parsed IRS Form 990-PF foundation records. This dataset is separate from the fictional prospect demo.</p><form className="foundation-filters"><FoundationSearch key={`${openOnly}:${query}`} names={names} initialValue={query} /><label><input type="checkbox" name="open" value="1" defaultChecked={openOnly} />Open to applications only</label><button type="submit">Filter</button></form>{error ? <p role="alert" className="foundation-error">{error}</p> : <><p className="foundation-count">Top {rows.length} foundations by grants paid</p><div className="foundation-table-wrap"><table><thead><tr><th>Foundation</th><th>State</th><th>Grants paid</th><th>Grants</th><th>Foreign</th><th>Status</th><th>Contact</th></tr></thead><tbody>{rows.map((row) => <tr key={row.object_id}><td>{row.name}<div className="ein">EIN {row.ein}</div></td><td>{row.state}</td><td>{usd(row.grants_paid_usd)}</td><td>{row.grants_paid_n}</td><td>{row.foreign_grants_n}</td><td>{row.only_preselected ? "Preselected only" : row.open_to_apps ? "Open" : "Unclear"}</td><td>{[row.contact_name, row.contact_phone, row.contact_email].filter(Boolean).join(" · ") || "—"}</td></tr>)}</tbody></table></div></>}</div></main>;
}