import { runAgent } from "@/lib/agent";
import { requireAccess } from "@/lib/auth";
import { fail } from "@/lib/http";
import { llmConfigured } from "@/lib/llm";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({
  // A single string is shorthand for one user turn. Send the full history to continue a conversation.
  message: z.string().min(3).max(4000).optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) })).min(1).max(20).optional(),
}).refine((b) => b.message || b.messages, "Provide `message` or `messages`");

export async function POST(req: Request) {
  const denied = requireAccess(req);
  if (denied) return denied;
  if (!llmConfigured()) return Response.json({ error: "ANTHROPIC_API_KEY is not set on the server." }, { status: 503 });
  try {
    const b = Body.parse(await req.json());
    const messages = b.messages ?? [{ role: "user" as const, content: b.message! }];
    if (messages[messages.length - 1].role !== "user") return Response.json({ error: "Last message must be from the user" }, { status: 400 });
    return Response.json(await runAgent(messages));
  } catch (e) {
    return fail(e);
  }
}
