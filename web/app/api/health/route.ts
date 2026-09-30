import { getPool } from "@/lib/db";
import { llmConfigured, MODEL } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function GET() {
  const out: Record<string, unknown> = { db: "not_configured", llm: llmConfigured() ? { configured: true, model: MODEL } : { configured: false }, access_key_set: !!process.env.APP_ACCESS_KEY };
  const pool = getPool();
  if (pool) {
    try {
      const { rows } = await pool.query(`SELECT count(*)::int AS profiles, count(*) FILTER (WHERE open_to_apps)::int AS open, max(latest_tax_period) AS latest FROM foundation_profiles`);
      out.db = "ok";
      out.index = rows[0];
    } catch (e) {
      out.db = "error";
      out.db_error = (e as Error).message;
    }
  }
  return Response.json(out, { status: out.db === "error" ? 503 : 200 });
}
