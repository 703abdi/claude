const XAI_CHAT_URL = "https://api.x.ai/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 50_000;

export function defaultGrokModel() {
  return process.env.XAI_MODEL || "grok-4";
}

export async function callGrok({
  model,
  systemPrompt,
  prompt,
}: {
  model: string;
  systemPrompt?: string | null;
  prompt: string;
}): Promise<string> {
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error("XAI_API_KEY is not set");

  const messages = [
    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    { role: "user", content: prompt },
  ];

  const res = await fetch(XAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`xAI ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}
