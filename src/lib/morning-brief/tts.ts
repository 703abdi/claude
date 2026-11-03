const OPENAI_VOICE_MAP: Record<string, string> = {
  "neutral-professional": "onyx",
  "calm-british": "fable",
  "deep-cinematic": "echo",
  "warm-conversational": "nova",
};

// Public default ElevenLabs voice ("Rachel"), available to every account —
// override with ELEVENLABS_VOICE_ID for a different voice.
const DEFAULT_ELEVENLABS_VOICE = "21m00Tcm4TlvDq8ikWAM";

export type TtsResult = { buffer: Buffer; mimeType: string };

async function generateWithOpenAI(text: string, voiceStyle: string): Promise<TtsResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const voice = OPENAI_VOICE_MAP[voiceStyle] ?? "onyx";
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "tts-1", voice, input: text.slice(0, 4000) }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI TTS failed: ${res.status} ${detail}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType: "audio/mpeg" };
}

async function generateWithElevenLabs(text: string): Promise<TtsResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_ELEVENLABS_VOICE;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: text.slice(0, 5000),
      model_id: "eleven_monolingual_v1",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${detail}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType: "audio/mpeg" };
}

/** Returns null when no TTS provider is configured — callers fall back to text-only. */
export async function generateSpeech(text: string, voiceStyle: string): Promise<TtsResult | null> {
  const provider = process.env.TTS_PROVIDER;
  if (provider === "openai") return generateWithOpenAI(text, voiceStyle);
  if (provider === "elevenlabs") return generateWithElevenLabs(text);
  return null;
}
