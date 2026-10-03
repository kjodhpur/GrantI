import { Pool } from "pg";

// One pool per server instance. On Vercel use a pooled connection string (see docs/03-VERCEL-SETUP.md).
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export function getPool(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!globalForPg.pgPool) {
    const local = /localhost|127\.0\.0\.1|host=\//.test(url);
    globalForPg.pgPool = new Pool({
      connectionString: url,
      max: 3,
      ssl: local ? undefined : { rejectUnauthorized: false },
    });
  }
  return globalForPg.pgPool;
}

export type Foundation = {
  object_id: string;
  ein: string;
  name: string;
  state: string | null;
  only_preselected: boolean | null;
  open_to_apps: boolean | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  grants_paid_n: number;
  grants_paid_usd: string; // bigint comes back as a string
  foreign_grants_n: number;
};

export async function listFoundationNames(openOnly: boolean): Promise<string[]> {
  const pool = getPool();
  if (!pool) throw new Error("NO_DB");
  const { rows } = await pool.query<{ name: string }>(
    `SELECT DISTINCT name FROM foundations
      WHERE ($1::boolean = false OR open_to_apps)
        AND name IS NOT NULL AND trim(name) <> ''
      ORDER BY name`,
    [openOnly]
  );
  return rows.map(({ name }) => name);
}

export async function listFoundations(openOnly: boolean, q: string): Promise<Foundation[]> {
  const pool = getPool();
  if (!pool) throw new Error("NO_DB");
  const { rows } = await pool.query<Foundation>(
    `SELECT object_id, ein, name, state, only_preselected, open_to_apps, contact_name, contact_phone,
            contact_email, grants_paid_n, grants_paid_usd, foreign_grants_n
       FROM foundations
      WHERE ($1::boolean = false OR open_to_apps)
        AND ($2 = '' OR name ILIKE '%' || $2 || '%')
      ORDER BY grants_paid_usd DESC
      LIMIT 100`,
    [openOnly, q]
  );
  return rows;
}
