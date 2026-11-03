import Anthropic from "@anthropic-ai/sdk";
import { AI_MODEL } from "@/lib/ai";

export type ServerAgentKind = "GROK" | "NVIDIA" | "CLAUDE";

export function defaultModelFor(kind: "GROK" | "NVIDIA" | "CLAUDE" | "LOCAL"): string | null {
  switch (kind) {
    case "GROK":
      return process.env.XAI_MODEL || "grok-4";
    case "NVIDIA":
      return process.env.NVIDIA_MODEL || "nvidia/nemotron-3-super-120b-a12b";
    case "CLAUDE":
      return process.env.CLAUDE_AGENT_MODEL || AI_MODEL;
    case "LOCAL":
      return null;
  }
}

const REQUEST_TIMEOUT_MS = 50_000;

// Caps the answer length so a run finishes well inside the function's time limit.
const MAX_OUTPUT_TOKENS = 1500;

async function openAICompatible({
  provider,
  keyName,
  baseUrl,
  model,
  system,
  prompt,
}: {
  provider: string;
  keyName: string;
  baseUrl: string;
  model: string;
  system?: string | null;
  prompt: string;
}) {
  const apiKey = requireKey(keyName);
  const messages = [
    ...(system ? [{ role: "system", content: system }] : []),
    { role: "user", content: prompt },
  ];
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, max_tokens: MAX_OUTPUT_TOKENS }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new Error(`${provider} took longer than ${REQUEST_TIMEOUT_MS / 1000} seconds, so the run was stopped. Try a shorter task.`);
    }
    throw new Error(`Couldn't reach ${provider}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    if (res.status === 401 || res.status === 403) {
      throw new Error(`${provider} rejected the API key (${res.status}). Check ${keyName} in Vercel, then redeploy.`);
    }
    if (res.status === 404 || res.status === 410) {
      throw new Error(`${provider} doesn't offer the model "${model}" (${res.status}). Remove this agent and add it again with the model box blank.`);
    }
    if (res.status === 429) {
      throw new Error(`${provider} is rate-limiting this key (429). Wait a minute and try again.`);
    }
    throw new Error(`${provider} returned an error (${res.status}): ${detail}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string | null; reasoning_content?: string | null } }[];
  };
  const message = json.choices?.[0]?.message;
  // Reasoning models can spend the whole budget thinking and leave content empty.
  return message?.content || message?.reasoning_content || "";
}

function requireKey(name: string) {
  const key = process.env[name]?.trim();
  if (!key) throw new Error(`${name} isn't set. Add it in Vercel (Settings → Environment Variables), then redeploy.`);
  return key;
}

export async function runServerAgent({
  kind,
  model,
  system,
  prompt,
}: {
  kind: ServerAgentKind;
  model: string;
  system?: string | null;
  prompt: string;
}): Promise<string> {
  if (kind === "GROK") {
    return openAICompatible({
      provider: "Grok",
      keyName: "XAI_API_KEY",
      baseUrl: "https://api.x.ai/v1",
      model,
      system,
      prompt,
    });
  }
  if (kind === "NVIDIA") {
    return openAICompatible({
      provider: "NVIDIA",
      keyName: "NVIDIA_API_KEY",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      model,
      system,
      prompt,
    });
  }
  const client = new Anthropic({ apiKey: requireKey("ANTHROPIC_API_KEY"), timeout: REQUEST_TIMEOUT_MS });
  const message = await client.messages.create({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    ...(system ? { system } : {}),
    messages: [{ role: "user", content: prompt }],
  });
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}
