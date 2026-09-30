import { requireAccess } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { fail } from "@/lib/http";
import { z } from "zod";

export const dynamic = "force-dynamic";

// The moat: customers log which foundations they approached and what happened. Append-only.
const Outcome = z.object({
  org_id: z.string().min(1).max(100),
  foundation_ein: z.string().regex(/^\d{9}$/),
  status: z.enum(["approached", "funded", "declined"]),
  amount_usd: z.number().int().nonnegative().max(1e10).optional(),
  note: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const denied = requireAccess(req);
  if (denied) return denied;
  try {
    const o = Outcome.parse(await req.json());
    const pool = getPool();
    if (!pool) throw new Error("NO_DB");
    const { rows } = await pool.query(
      `INSERT INTO outcomes (org_id, foundation_ein, status, amount_usd, note) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
      [o.org_id, o.foundation_ein, o.status, o.amount_usd ?? null, o.note ?? null]
    );
    return Response.json(rows[0], { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

export async function GET(req: Request) {
  const denied = requireAccess(req);
  if (denied) return denied;
  try {
    const orgId = new URL(req.url).searchParams.get("org_id");
    if (!orgId) return Response.json({ error: "org_id is required" }, { status: 400 });
    const pool = getPool();
    if (!pool) throw new Error("NO_DB");
    const { rows } = await pool.query(
      `SELECT o.id, o.foundation_ein, p.name AS foundation_name, o.status, o.amount_usd, o.note, o.created_at
         FROM outcomes o LEFT JOIN foundation_profiles p ON p.ein = o.foundation_ein
        WHERE o.org_id = $1 ORDER BY o.created_at DESC LIMIT 500`,
      [orgId]
    );
    return Response.json({ outcomes: rows });
  } catch (e) {
    return fail(e);
  }
}
