import type { RawContextInput } from "./types";
import { ContextSourceType } from "@prisma/client";

/**
 * Parses the conversations.json file from Claude.ai's "Export data" feature
 * (Settings → Account → Export data). Anthropic doesn't expose a live API
 * for a user to pull their own conversation history, so a manual export is
 * the only way to get it into the Context Engine today — same constraint,
 * same shape of workaround, as the ChatGPT connector.
 *
 * Export format has two message-body shapes seen in the wild: a flat
 * `text` field, and a `content` array of typed blocks (some conversations
 * mix tool-use/thinking blocks in with text). Only text blocks are kept.
 */

type ClaudeContentBlock = { type?: string; text?: string };

type ClaudeMessage = {
  uuid?: string;
  text?: string;
  content?: ClaudeContentBlock[];
  sender?: string; // "human" | "assistant"
  created_at?: string;
};

type ClaudeConversation = {
  uuid?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
  chat_messages?: ClaudeMessage[];
};

function messageText(m: ClaudeMessage): string {
  if (m.text && m.text.trim()) return m.text;
  if (Array.isArray(m.content)) {
    return m.content
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n");
  }
  return "";
}

export function parseClaudeExport(raw: unknown, maxConversations = 50): RawContextInput[] {
  if (!Array.isArray(raw)) {
    throw new Error("Expected conversations.json to contain an array of conversations.");
  }

  const conversations = raw as ClaudeConversation[];
  const sorted = [...conversations]
    .sort((a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime())
    .slice(0, maxConversations);

  const items: RawContextInput[] = [];

  for (const convo of sorted) {
    const id = convo.uuid;
    if (!id || !convo.chat_messages?.length) continue;

    const messages = convo.chat_messages
      .filter((m) => m.sender === "human" || m.sender === "assistant")
      .sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());

    const transcript = messages
      .map((m) => {
        const text = messageText(m);
        if (!text.trim()) return null;
        const role = m.sender === "human" ? "abdi" : "claude";
        return `${role}: ${text}`;
      })
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 8000);

    if (!transcript.trim()) continue;

    const updatedAt = convo.updated_at ? new Date(convo.updated_at) : new Date();

    items.push({
      source: ContextSourceType.CLAUDE,
      sourceId: id,
      sourceUrl: null,
      timestamp: updatedAt.toISOString(),
      content: convo.name ? `[${convo.name}]\n${transcript}` : transcript,
      project: null,
    });
  }

  return items;
}
