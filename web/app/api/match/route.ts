import { CriteriaPatchSchema, CriteriaSchema, extractCriteria } from "@/lib/criteria";
import { fail } from "@/lib/http";
import { matchFoundations } from "@/lib/match";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Body is either structured criteria, or { text: "what we do..." } which is parsed deterministically (no LLM).
// Structured fields override anything parsed from `text`.
const Body = CriteriaPatchSchema.extend({ text: z.string().min(3).max(4000).optional() });

export async function POST(req: Request) {
  try {
    const { text, ...structured } = Body.parse(await req.json());
    const parsed = text ? extractCriteria(text) : CriteriaSchema.parse({});
    const defined = Object.fromEntries(Object.entries(structured).filter(([, v]) => v !== undefined));
    const criteria = CriteriaSchema.parse({ ...parsed, ...defined });
    return Response.json(await matchFoundations(criteria));
  } catch (e) {
    return fail(e);
  }
}
