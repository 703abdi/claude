import type { RawContextInput } from "./types";
import { ContextSourceType } from "@prisma/client";

/**
 * Parses the conversations.json file from ChatGPT's "Export data" feature
 * (Settings → Data controls → Export). This is the only mechanism OpenAI
 * currently offers a third party to obtain a user's ChatGPT conversation
 * history — there is no public live API for it. See README for the
 * documented remaining connection point.
 */

type ChatGPTMessageNode = {
  message?: {
    author?: { role?: string };
    content?: { parts?: unknown[] };
    create_time?: number | null;
  } | null;
  children?: string[];
};

type ChatGPTConversation = {
  id?: string;
  conversation_id?: string;
  title?: string;
  create_time?: number;
  update_time?: number;
  mapping?: Record<string, ChatGPTMessageNode>;
};

export function parseChatGPTExport(raw: unknown, maxConversations = 50): RawContextInput[] {
  if (!Array.isArray(raw)) {
    throw new Error("Expected conversations.json to contain an array of conversations.");
  }

  const conversations = raw as ChatGPTConversation[];
  const sorted = [...conversations]
    .sort((a, b) => (b.update_time ?? 0) - (a.update_time ?? 0))
    .slice(0, maxConversations);

  const items: RawContextInput[] = [];

  for (const convo of sorted) {
    const id = convo.conversation_id || convo.id;
    if (!id || !convo.mapping) continue;

    const messages = Object.values(convo.mapping)
      .map((node) => node.message)
      .filter((m): m is NonNullable<typeof m> => !!m && !!m.content?.parts?.length)
      .filter((m) => m.author?.role === "user" || m.author?.role === "assistant")
      .sort((a, b) => (a.create_time ?? 0) - (b.create_time ?? 0));

    if (messages.length === 0) continue;

    const transcript = messages
      .map((m) => {
        const text = (m.content?.parts ?? [])
          .filter((p): p is string => typeof p === "string")
          .join("\n");
        if (!text.trim()) return null;
        const role = m.author?.role === "user" ? "abdi" : "chatgpt";
        return `${role}: ${text}`;
      })
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 8000);

    if (!transcript.trim()) continue;

    const updateTime = convo.update_time ? new Date(convo.update_time * 1000) : new Date();

    items.push({
      source: ContextSourceType.CHATGPT,
      sourceId: id,
      sourceUrl: null,
      timestamp: updateTime.toISOString(),
      content: convo.title ? `[${convo.title}]\n${transcript}` : transcript,
      project: null,
    });
  }

  return items;
}
