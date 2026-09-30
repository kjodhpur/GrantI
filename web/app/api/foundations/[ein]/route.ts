import { fail } from "@/lib/http";
import { getFoundation } from "@/lib/match";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/foundations/[ein]">) {
  try {
    const { ein } = await ctx.params;
    if (!/^\d{9}$/.test(ein)) return Response.json({ error: "EIN must be 9 digits" }, { status: 400 });
    const f = await getFoundation(ein);
    return f ? Response.json(f) : Response.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    return fail(e);
  }
}
