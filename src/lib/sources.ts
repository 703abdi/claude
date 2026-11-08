import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

/** Every source that can feed the Hub, in one place. Settings renders this list; adding a
 * key in Vercel lights the row up with no further code. Pulls live in their own files. */

export type SourceGroup = "Calls and calendar" | "Pipeline" | "Money" | "Audience" | "Agents and brain" | "Reach you";

export type SourceDef = {
  id: string;
  name: string;
  group: SourceGroup;
  phase: 1 | 2 | 3 | 4;
  /** All of these env names must be set. Any name in a nested array is an alias (one of). */
  env: (string | string[])[];
  /** What shows up on the home screen once it is on. */
  gives: string;
  /** Where Abdi gets the key. */
  setup: string;
  /** SyncSource row that records pulls, if this source pulls. */
  sync?: { type: "MANUAL" | "CALENDAR" | "OBSIDIAN" | "CHATGPT" | "CLAUDE"; name: string };
  /** POST endpoint that runs a pull now. */
  syncUrl?: string;
  /** Lives in Settings as its own card rather than a key. */
  custom?: "feeds" | "zapier";
  /** Built in code and ready to use once the key is there. */
  built: boolean;
};

export const SOURCES: SourceDef[] = [
  {
    id: "fathom",
    name: "Fathom calls",
    group: "Calls and calendar",
    phase: 1,
    env: [["FATHOM_API_KEY", "fathom_key", "FATHOM_KEY"]],
    gives: "Action items from every recorded call become tasks. The call sits in the feed with its link.",
    setup: "Fathom: Settings, API, create a key.",
    sync: { type: "MANUAL", name: "fathom" },
    syncUrl: "/api/fathom/sync",
    built: true,
  },
  {
    id: "calendar-feeds",
    name: "Calendar feeds (iCal)",
    group: "Calls and calendar",
    phase: 1,
    env: [],
    gives: "Google Calendar or Calendly events fill the Hub calendar, read-only.",
    setup: "Paste the secret iCal address below.",
    sync: { type: "CALENDAR", name: "ics" },
    custom: "feeds",
    built: true,
  },
  {
    id: "google",
    name: "Google (Gmail + Calendar)",
    group: "Calls and calendar",
    phase: 1,
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    gives: "Threads waiting on your reply become owed items. Events with attendees replace the iCal feed.",
    setup: "Google Cloud: OAuth client (web), redirect to /api/google/callback. Then Connect Google here.",
    built: false,
  },
  {
    id: "calendly",
    name: "Calendly",
    group: "Pipeline",
    phase: 1,
    env: ["CALENDLY_TOKEN"],
    gives: "Every booking lands on the calendar with the invitee as a person, adds one to booked, and posts to the feed. Cancellations clear it.",
    setup: "Calendly: Integrations, API and webhooks, Personal access tokens, Generate. Paste as CALENDLY_TOKEN.",
    sync: { type: "MANUAL", name: "calendly" },
    syncUrl: "/api/calendly/sync",
    built: true,
  },
  {
    id: "zapier",
    name: "Zapier webhook",
    group: "Pipeline",
    phase: 2,
    env: [],
    gives: "Anything already routed through Zapier posts into the feed or Today.",
    setup: "Add a Webhooks by Zapier action, POST to the URL below.",
    custom: "zapier",
    built: true,
  },
  {
    id: "whop",
    name: "Whop",
    group: "Money",
    phase: 2,
    env: ["WHOP_API_KEY"],
    gives: "New members, failed payments, churn. Cash collected flows into the goal ring.",
    setup: "Whop: Developer, API keys.",
    sync: { type: "MANUAL", name: "whop" },
    built: false,
  },
  {
    id: "stripe",
    name: "Stripe",
    group: "Money",
    phase: 2,
    env: ["STRIPE_SECRET_KEY"],
    gives: "Payouts and charges into the cash ring.",
    setup: "Stripe: Developers, API keys, restricted key with read access.",
    sync: { type: "MANUAL", name: "stripe" },
    built: false,
  },
  {
    id: "ghl",
    name: "GoHighLevel",
    group: "Pipeline",
    phase: 2,
    env: ["GHL_API_KEY"],
    gives: "Pipeline stage changes and lead SMS replies in the feed.",
    setup: "GHL: Settings, Business profile, API key.",
    sync: { type: "MANUAL", name: "ghl" },
    built: false,
  },
  {
    id: "instagram",
    name: "Instagram (Tawakkul)",
    group: "Audience",
    phase: 2,
    env: ["META_ACCESS_TOKEN", "IG_USER_ID"],
    gives: "Followers, reach and saves on the last post, DMs in the last day, one line: post or don't.",
    setup: "Meta for Developers: app, Instagram Graph API, long-lived token.",
    sync: { type: "MANUAL", name: "instagram" },
    built: false,
  },
  {
    id: "abdiform",
    name: "abdiform",
    group: "Audience",
    phase: 2,
    env: ["ABDIFORM_URL", "ABDIFORM_METRICS_TOKEN"],
    gives: "Leads today and this week.",
    setup: "Set on the abdiform deployment, then here.",
    built: true,
  },
  {
    id: "agents",
    name: "Agents (Grok, Codex, Claude Code, Jarvis)",
    group: "Agents and brain",
    phase: 1,
    env: ["AGENTS_TOKEN"],
    gives: "Agents post tasks, notes and questions into the feed and read /api/state.",
    setup: "Any long random string. Same value goes in each agent's config. See docs/agent-api.md.",
    built: true,
  },
  {
    id: "claude",
    name: "Claude (brief and nightly pass)",
    group: "Agents and brain",
    phase: 4,
    env: ["ANTHROPIC_API_KEY"],
    syncUrl: "/api/brain?run=1",
    gives: "Morning brief text, and the nightly brain pass: orders tomorrow, turns the knobs in the Brain section, explains itself in the feed.",
    setup: "console.anthropic.com, API keys.",
    built: true,
  },
  {
    id: "voice",
    name: "Brief voice",
    group: "Agents and brain",
    phase: 4,
    env: ["TTS_PROVIDER", ["ELEVENLABS_API_KEY", "OPENAI_API_KEY"]],
    gives: "The morning brief as audio.",
    setup: "TTS_PROVIDER = elevenlabs or openai, plus that provider's key.",
    built: true,
  },
  {
    id: "obsidian",
    name: "Obsidian vault",
    group: "Agents and brain",
    phase: 2,
    env: ["OBSIDIAN_SYNC_TOKEN"],
    gives: "Notes and people from the vault as context.",
    setup: "Any long random string here and in sync-agent/.env, then run the sync agent.",
    sync: { type: "OBSIDIAN", name: "default" },
    built: true,
  },
  {
    id: "email",
    name: "Email digests (Resend)",
    group: "Reach you",
    phase: 3,
    env: ["RESEND_API_KEY", "DIGEST_TO"],
    gives: "7am: your Do-this-now line and three. 9pm: the day's numbers and what slipped. Sunday: the scorecard.",
    setup: "resend.com free tier, API key. DIGEST_TO is the address to send to. Without it digests still post to the feed.",
    built: true,
  },
  {
    id: "sms",
    name: "Text messages (Twilio)",
    group: "Reach you",
    phase: 3,
    env: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM", "ABDI_PHONE"],
    gives: "Same digests as SMS.",
    setup: "twilio.com, a number, and your mobile in ABDI_PHONE.",
    built: false,
  },
];

export function envSet(env: SourceDef["env"]) {
  return env.every((e) => (Array.isArray(e) ? e.some((n) => Boolean(process.env[n]?.trim())) : Boolean(process.env[e]?.trim())));
}

/** Stable secret for the Zapier URL, derived from AUTH_SECRET so no new key is needed. */
export function zapierSecret() {
  const base = process.env.AUTH_SECRET ?? "";
  return createHash("sha256").update(`zapier:${base}`).digest("hex").slice(0, 32);
}

export type SourceStatus = SourceDef & {
  configured: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
};

export async function sourceStatuses(): Promise<SourceStatus[]> {
  const rows = await prisma.syncSource.findMany({ select: { type: true, name: true, enabled: true, lastSyncAt: true, lastSyncStatus: true, lastSyncError: true } });
  return SOURCES.map((s) => {
    const row = s.sync ? rows.find((r) => r.type === s.sync!.type && r.name === s.sync!.name) : null;
    const configured = s.custom === "feeds" ? Boolean(row?.enabled) : s.custom === "zapier" ? true : envSet(s.env);
    return {
      ...s,
      configured,
      lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
      lastSyncStatus: row?.lastSyncStatus ?? null,
      lastSyncError: row?.lastSyncError ?? null,
    };
  });
}
