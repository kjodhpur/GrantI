import { listFoundations, type Foundation } from "@/lib/db";

// Always query the database at request time (data changes after each pipeline run).
export const dynamic = "force-dynamic";

const usd = (v: string | number) =>
  Number(v).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const openOnly = sp.open === "1";
  const q = (sp.q ?? "").trim();

  let rows: Foundation[] = [];
  let error: string | null = null;
  try {
    rows = await listFoundations(openOnly, q);
  } catch (e) {
    error =
      (e as Error).message === "NO_DB"
        ? "DATABASE_URL is not set. Copy .env.example to web/.env.local and fill it in (see docs/02-LOCAL-SETUP.md)."
        : `Database error: ${(e as Error).message}. Did you run the pipeline and load Postgres? (docs/05-DATA-PIPELINE.md)`;
  }

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 20px" }}>
      <h1 style={{ marginBottom: 4 }}>Grant Prospect Intelligence</h1>
      <p style={{ color: "#9aa4b2", marginTop: 0 }}>
        Team 6 · CIS 568 · starter view of foundations parsed from IRS Form 990-PF
      </p>

      <form style={{ display: "flex", gap: 12, alignItems: "center", margin: "20px 0" }}>
        <input name="q" defaultValue={q} placeholder="Search foundation name" />
        <label>
          <input type="checkbox" name="open" value="1" defaultChecked={openOnly} /> Open to applications only
        </label>
        <button type="submit">Filter</button>
      </form>

      {error ? (
        <p role="alert" style={{ color: "#ff8a8a" }}>{error}</p>
      ) : (
        <>
          <p style={{ color: "#9aa4b2" }}>Top {rows.length} by grants paid</p>
          <table>
            <thead>
              <tr><th>Foundation</th><th>State</th><th>Grants paid</th><th>Grants</th><th>Foreign</th><th>Status</th><th>Contact</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.object_id}>
                  <td>{r.name}<div className="ein">EIN {r.ein}</div></td>
                  <td>{r.state}</td>
                  <td>{usd(r.grants_paid_usd)}</td>
                  <td>{r.grants_paid_n}</td>
                  <td>{r.foreign_grants_n}</td>
                  <td>{r.only_preselected ? "Preselected only" : r.open_to_apps ? "Open" : "Unclear"}</td>
                  <td>{[r.contact_name, r.contact_phone, r.contact_email].filter(Boolean).join(" · ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
