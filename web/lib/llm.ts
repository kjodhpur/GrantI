import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
export const llmConfigured = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let client: Anthropic | null = null;
export function getClient(): Anthropic {
  if (!llmConfigured()) throw new Error("NO_LLM");
  return (client ??= new Anthropic({ maxRetries: 2, timeout: 120_000 }));
}
