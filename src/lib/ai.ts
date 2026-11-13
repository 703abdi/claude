import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null | undefined;

/**
 * Returns null when ANTHROPIC_API_KEY isn't configured. Callers must
 * degrade gracefully (store raw data, skip the AI step) rather than
 * fabricate results — see spec §36/§66: no fake AI.
 */
export function getAnthropicClient(): Anthropic | null {
  if (client !== undefined) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  client = apiKey ? new Anthropic({ apiKey }) : null;
  return client;
}

export const AI_MODEL = "claude-sonnet-5";

export async function extractJson<T>(prompt: string, maxTokens = 1024): Promise<T | null> {
  const anthropic = getAnthropicClient();
  if (!anthropic) return null;

  const message = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch {
    return null;
  }
}
