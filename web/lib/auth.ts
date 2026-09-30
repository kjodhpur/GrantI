import { timingSafeEqual } from "node:crypto";

/**
 * Shared-secret guard for endpoints that spend money (LLM agent) or touch customer data (outcomes).
 * Send the key as `x-api-key: <key>` or `Authorization: Bearer <key>`.
 * In production the endpoints refuse to run at all until APP_ACCESS_KEY is configured.
 * TODO: replace with real per-user auth before any customer uses this.
 */
export function requireAccess(req: Request): Response | null {
  const key = process.env.APP_ACCESS_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      return Response.json({ error: "APP_ACCESS_KEY is not configured on the server." }, { status: 503 });
    }
    return null; // local dev without a key
  }
  const header = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(header);
  const b = Buffer.from(key);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
