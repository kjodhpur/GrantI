import { ZodError } from "zod";

export function fail(e: unknown): Response {
  if (e instanceof ZodError) {
    return Response.json({ error: "Invalid request", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  }
  if (e instanceof SyntaxError) return Response.json({ error: "Body must be valid JSON" }, { status: 400 });
  const msg = (e as Error).message;
  if (msg === "NO_DB") return Response.json({ error: "DATABASE_URL is not set on the server." }, { status: 503 });
  if ((e as { code?: string }).code === "42P01") {
    return Response.json({ error: "The foundation index is not loaded in this database. Run pipeline/build_profiles.py --load (docs/07-BACKEND-API.md)." }, { status: 503 });
  }
  console.error(e);
  return Response.json({ error: "Internal error" }, { status: 500 });
}
