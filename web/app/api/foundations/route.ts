import { fail } from "@/lib/http";
import { searchFoundations } from "@/lib/match";

export const dynamic = "force-dynamic";

/** GET /api/foundations?q=name → up to 10 foundation profiles whose name contains q, largest givers first. */
export async function GET(req: Request) {
  try {
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
    if (q.length < 2 || q.length > 120) return Response.json({ error: "q must be 2 to 120 characters" }, { status: 400 });
    return Response.json({ results: await searchFoundations(q) });
  } catch (e) {
    return fail(e);
  }
}
