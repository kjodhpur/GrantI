import { MATCHABLE_CAUSES } from "@/lib/taxonomy";

export const dynamic = "force-static";

export function GET() {
  return Response.json({ causes: MATCHABLE_CAUSES.map((c) => ({ id: c.id, label: c.label })) });
}
