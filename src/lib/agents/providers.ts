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

async function openAICompatible({
  baseUrl,
  apiKey,
  model,
  system,
  prompt,
}: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system?: string | null;
  prompt: string;
}) {
  const messages = [
    ...(system ? [{ role: "system", content: system }] : []),
    { role: "user", content: prompt },
  ];
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`${baseUrl} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

function requireKey(name: string) {
  const key = process.env[name];
  if (!key) throw new Error(`${name} is not set`);
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
      baseUrl: "https://api.x.ai/v1",
      apiKey: requireKey("XAI_API_KEY"),
      model,
      system,
      prompt,
    });
  }
  if (kind === "NVIDIA") {
    return openAICompatible({
      baseUrl: "https://integrate.api.nvidia.com/v1",
      apiKey: requireKey("NVIDIA_API_KEY"),
      model,
      system,
      prompt,
    });
  }
  const client = new Anthropic({ apiKey: requireKey("ANTHROPIC_API_KEY"), timeout: REQUEST_TIMEOUT_MS });
  const message = await client.messages.create({
    model,
    max_tokens: 1500,
    ...(system ? { system } : {}),
    messages: [{ role: "user", content: prompt }],
  });
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}
