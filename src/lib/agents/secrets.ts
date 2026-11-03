// Provider keys belong in env vars, never in an agent's model field. These
// prefixes cover NVIDIA, xAI, Anthropic and OpenAI-style keys.
const KEY_PREFIX = /^(nvapi-|xai-|sk-|sk-ant-)/i;

export function looksLikeApiKey(value: string | null | undefined): boolean {
  return !!value && KEY_PREFIX.test(value.trim());
}
