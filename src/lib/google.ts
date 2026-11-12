import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { addDaysKey, clockInTz, dayKey, zonedTime } from "@/lib/day";
import { notePerson } from "@/lib/people-auto";
import { logSignal } from "@/lib/signals";

/** Google <-> the OS. One OAuth connection (Settings, Sources, Connect Google) gives read and
 * write access to events on the primary calendar, and read access to Gmail. Google events land
 * here with the first outside attendee as a person, and events made or edited here are written
 * back to Google (see pushEventToGoogle). A connection made before Nov 12 2026 is read-only
 * until Google is connected again; unread primary-inbox mail from the last two days posts to the
 * feed as "gmail". Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (a Web OAuth client whose
 * redirect URI is <origin>/api/google/callback). Tokens live in SyncSource MANUAL/"google".
 * Throttled to one pull every 3 minutes. */

const SOURCE = { type: "MANUAL" as const, name: "google" };
const THROTTLE_MS = 3 * 60_000;
const PAST_DAYS = 7;
const FUTURE_DAYS = 45;
const MAIL_MAX = 15;
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
];

type Config = {
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: number;
  email?: string;
  seenMail?: string[];
  /** True once the connection was granted calendar.events (write). */
  canWrite?: boolean;
};

function clientId() {
  return (process.env.GOOGLE_CLIENT_ID ?? "").trim();
}
function clientSecret() {
  return (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
}

export function googleConfigured() {
  return clientId().length > 0 && clientSecret().length > 0;
}

/** The deployment's public origin, for the OAuth redirect URI. */
export function appOrigin(reqOrigin?: string | null) {
  const env = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return (env || reqOrigin || "http://localhost:3000").replace(/\/$/, "");
}

export function redirectUri(reqOrigin?: string | null) {
  return `${appOrigin(reqOrigin)}/api/google/callback`;
}

async function readConfig(): Promise<Config> {
  const row = await prisma.syncSource.findUnique({ where: { type_name: SOURCE }, select: { config: true } });
  return ((row?.config ?? {}) as Config) || {};
}

async function writeConfig(cfg: Config) {
  await prisma.syncSource.upsert({
    where: { type_name: SOURCE },
    update: { config: cfg as object, enabled: Boolean(cfg.refreshToken) },
    create: { ...SOURCE, config: cfg as object, enabled: Boolean(cfg.refreshToken) },
  });
}

export async function googleStatus() {
  const row = await prisma.syncSource.findUnique({ where: { type_name: SOURCE } });
  const cfg = ((row?.config ?? {}) as Config) || {};
  return {
    configured: googleConfigured(),
    connected: Boolean(cfg.refreshToken),
    canWrite: Boolean(cfg.refreshToken && cfg.canWrite),
    email: cfg.email ?? null,
    lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: row?.lastSyncStatus ?? null,
    lastSyncError: row?.lastSyncError ?? null,
  };
}

// ── OAuth ────────────────────────────────────────────────────────────────────

function sign(payload: string) {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "dev").update(payload).digest("base64url");
}

/** Signed, time-limited state so the callback only accepts flows we started. */
export function makeState() {
  const payload = `${randomBytes(12).toString("base64url")}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

export function checkState(state: string | null) {
  if (!state) return false;
  const i = state.lastIndexOf(".");
  if (i < 0) return false;
  const payload = state.slice(0, i);
  const sig = state.slice(i + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const ts = Number(payload.split(".")[1]);
  return Number.isFinite(ts) && Date.now() - ts < 10 * 60_000;
}

export function authUrl(reqOrigin: string | null) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId());
  u.searchParams.set("redirect_uri", redirectUri(reqOrigin));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", makeState());
  return u.toString();
}

type TokenResponse = { access_token: string; expires_in: number; scope?: string; refresh_token?: string; id_token?: string; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...body }),
    signal: AbortSignal.timeout(8000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) throw new Error(`Google token error: ${json.error_description ?? json.error ?? res.status}`);
  return json;
}

/** Callback step: trade the code for tokens and remember the account. */
export async function connectGoogle(code: string, reqOrigin: string | null) {
  const tok = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(reqOrigin) });
  if (!tok.refresh_token) throw new Error("Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and connect again.");
  let email: string | undefined;
  try {
    const me = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(8000) });
    email = ((await me.json()) as { email?: string }).email;
  } catch {
    /* email is cosmetic */
  }
  const prev = await readConfig();
  await writeConfig({ ...prev, refreshToken: tok.refresh_token, accessToken: tok.access_token, expiresAt: Date.now() + tok.expires_in * 1000 - 60_000, email, canWrite: (tok.scope ?? "").includes("auth/calendar.events") || (tok.scope ?? "").split(" ").includes("https://www.googleapis.com/auth/calendar") });
  await prisma.syncSource.update({ where: { type_name: SOURCE }, data: { lastSyncStatus: null, lastSyncError: null } });
  return { email: email ?? null };
}

export async function disconnectGoogle() {
  const cfg = await readConfig();
  if (cfg.refreshToken) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(cfg.refreshToken)}`, { method: "POST", signal: AbortSignal.timeout(5000) }).catch(() => null);
  }
  await prisma.syncSource.deleteMany({ where: SOURCE });
}

async function accessToken(cfg: Config): Promise<string> {
  if (cfg.accessToken && cfg.expiresAt && Date.now() < cfg.expiresAt) return cfg.accessToken;
  if (!cfg.refreshToken) throw new Error("Google is not connected.");
  const tok = await tokenRequest({ refresh_token: cfg.refreshToken, grant_type: "refresh_token" }).catch((e: Error) => {
    if (/invalid_grant/.test(e.message)) throw new Error("Google access was revoked. Connect Google again in Settings.");
    throw e;
  });
  cfg.accessToken = tok.access_token;
  cfg.expiresAt = Date.now() + tok.expires_in * 1000 - 60_000;
  return tok.access_token;
}

async function api<T>(cfg: Config, url: string): Promise<T> {
  const token = await accessToken(cfg);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
  if (res.status === 401) throw new Error("Google rejected the token. Connect Google again in Settings.");
  if (res.status === 403) throw new Error("Google refused: enable the Calendar and Gmail APIs on the Cloud project.");
  if (!res.ok) throw new Error(`Google answered ${res.status}`);
  return (await res.json()) as T;
}

// ── Calendar ─────────────────────────────────────────────────────────────────

type GAttendee = { email?: string; displayName?: string; self?: boolean; resource?: boolean; organizer?: boolean; responseStatus?: string };
type GEvent = {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  location?: string;
  hangoutLink?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: GAttendee[];
  eventType?: string;
  organizer?: { email?: string; self?: boolean };
};

function stripHtml(s: string | undefined) {
  if (!s) return null;
  const t = s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim();
  return t ? t.slice(0, 2000) : null;
}

function cleanName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = raw.replace(/\(.*?\)/g, "").replace(/[^\p{L}\p{M}' .-]/gu, " ").replace(/\s+/g, " ").trim();
  if (n.length < 2 || n.length > 60 || n.includes("@")) return null;
  return n
    .split(" ")
    .map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function isCalendlyEvent(ev: GEvent) {
  const blob = `${ev.description ?? ""} ${ev.location ?? ""} ${ev.htmlLink ?? ""}`.toLowerCase();
  return blob.includes("calendly.com");
}

async function syncCalendar(cfg: Config, tz: string, people: { id: string; name: string }[], myEmail: string | null) {
  const now = Date.now();
  const u = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  u.searchParams.set("timeMin", new Date(now - PAST_DAYS * 86_400_000).toISOString());
  u.searchParams.set("timeMax", new Date(now + FUTURE_DAYS * 86_400_000).toISOString());
  u.searchParams.set("singleEvents", "true");
  u.searchParams.set("orderBy", "startTime");
  u.searchParams.set("showDeleted", "true");
  u.searchParams.set("maxResults", "250");
  const json = await api<{ items?: GEvent[] }>(cfg, u.toString());

  let events = 0;
  let removed = 0;
  let newPeople = 0;
  for (const ev of json.items ?? []) {
    const externalId = `google:${ev.id}`;
    const existing = await prisma.calendarEvent.findUnique({ where: { externalId }, select: { id: true } });
    const skip = ev.status === "cancelled" || ev.eventType === "workingLocation" || ev.eventType === "outOfOffice" || isCalendlyEvent(ev) || !(ev.start?.dateTime || ev.start?.date);
    if (skip) {
      if (existing) {
        await prisma.calendarEvent.delete({ where: { id: existing.id } });
        removed++;
      }
      continue;
    }
    // Everyone on the invite but you and meeting rooms. Declined people still count: you still know them.
    const others = (ev.attendees ?? []).filter((a) => !a.self && !a.resource && a.email?.toLowerCase() !== myEmail?.toLowerCase());
    let person: { id: string; name: string } | null = null;
    for (const a of others.slice(0, 8)) {
      const before = people.length;
      const hit = await notePerson({ name: cleanName(a.displayName), email: a.email ?? null, ref: externalId, source: "google", note: "On a calendar invite with you." }, people);
      if (people.length > before) newPeople++;
      if (hit && !person) person = hit;
    }

    const allDay = Boolean(ev.start?.date && !ev.start.dateTime);
    let date: Date;
    let startTime: string | null = null;
    let endTime: string | null = null;
    if (allDay) {
      const [y, m, d] = ev.start!.date!.split("-").map(Number);
      date = zonedTime(y, m, d, 12, 0, tz);
    } else {
      date = new Date(ev.start!.dateTime!);
      startTime = clockInTz(date, tz);
      if (ev.end?.dateTime) endTime = clockInTz(new Date(ev.end.dateTime), tz);
    }
    const data = {
      title: (ev.summary?.trim() || "(no title)").slice(0, 200),
      date,
      startTime,
      endTime,
      allDay,
      location: ev.hangoutLink ?? ev.location?.slice(0, 500) ?? null,
      notes: stripHtml(ev.description),
      personId: person?.id ?? null,
      source: "google",
      externalId,
    };
    if (existing) await prisma.calendarEvent.update({ where: { id: existing.id }, data });
    else await prisma.calendarEvent.create({ data });
    events++;
  }
  return { events, removed, newPeople };
}

// ── Writing back ─────────────────────────────────────────────────────────────

export type PushableEvent = {
  id: string;
  title: string;
  date: Date;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  externalId: string | null;
};

function plusMinutes(hhmm: string, mins: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = Math.min(23 * 60 + 59, h * 60 + m + mins);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** The Google Calendar body for one of our events. Pure, so it can be tested. */
export function googleEventBody(ev: Omit<PushableEvent, "id" | "externalId">, tz: string) {
  const key = dayKey(ev.date, tz);
  const base = { summary: ev.title, location: ev.location ?? undefined, description: ev.notes ?? undefined };
  if (ev.allDay || !ev.startTime) {
    return { ...base, start: { date: key }, end: { date: addDaysKey(key, 1) } };
  }
  const end = ev.endTime && ev.endTime > ev.startTime ? ev.endTime : plusMinutes(ev.startTime, 30);
  return {
    ...base,
    start: { dateTime: `${key}T${ev.startTime}:00`, timeZone: tz },
    end: { dateTime: `${key}T${end}:00`, timeZone: tz },
  };
}

async function writeApi<T>(cfg: Config, method: "POST" | "PATCH" | "DELETE", url: string, body?: unknown): Promise<T | null> {
  const token = await accessToken(cfg);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (method === "DELETE" && (res.status === 204 || res.status === 404 || res.status === 410)) return null;
  if (res.status === 403) throw new Error("Google refused the change. Connect Google again in Settings to allow adding events.");
  if (!res.ok) throw new Error(`Google answered ${res.status}`);
  return (await res.json().catch(() => null)) as T | null;
}

const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/** Writes one event to Google: creates it when it has no Google id, updates it when it does.
 * Returns { externalId } on success, { skipped } when Google is not connected for writing,
 * { error } when Google said no. Never throws: the local save already happened. */
export async function pushEventToGoogle(ev: PushableEvent, tz: string): Promise<{ externalId: string } | { skipped: string } | { error: string }> {
  if (!googleConfigured()) return { skipped: "not configured" };
  const cfg = await readConfig();
  if (!cfg.refreshToken) return { skipped: "not connected" };
  if (!cfg.canWrite) return { skipped: "read-only connection" };
  if (ev.externalId && !ev.externalId.startsWith("google:")) return { skipped: "owned by another source" };
  try {
    const body = googleEventBody(ev, tz);
    const gid = ev.externalId?.slice("google:".length);
    const out = gid
      ? await writeApi<{ id: string }>(cfg, "PATCH", `${EVENTS_URL}/${encodeURIComponent(gid)}`, body)
      : await writeApi<{ id: string }>(cfg, "POST", EVENTS_URL, body);
    await writeConfig(cfg); // keep a refreshed access token
    if (!out?.id) return { error: "Google returned no event id" };
    return { externalId: `google:${out.id}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Google write failed" };
  }
}

export async function deleteEventFromGoogle(externalId: string | null): Promise<{ ok: true } | { skipped: string } | { error: string }> {
  if (!externalId?.startsWith("google:")) return { skipped: "not a Google event" };
  if (!googleConfigured()) return { skipped: "not configured" };
  const cfg = await readConfig();
  if (!cfg.refreshToken || !cfg.canWrite) return { skipped: "read-only connection" };
  try {
    await writeApi(cfg, "DELETE", `${EVENTS_URL}/${encodeURIComponent(externalId.slice("google:".length))}`);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Google delete failed" };
  }
}

// ── Gmail ────────────────────────────────────────────────────────────────────

type GMessage = { id: string; threadId: string; snippet?: string; payload?: { headers?: { name: string; value: string }[] } };

function header(m: GMessage, name: string) {
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** "Jane Doe <jane@x.com>" -> "Jane Doe"; bare address -> "jane@x.com". */
function fromName(from: string) {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  return (m ? m[1] : from).trim();
}

async function syncGmail(cfg: Config) {
  const seen = new Set(cfg.seenMail ?? []);
  const u = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  u.searchParams.set("q", "is:unread category:primary newer_than:2d -from:me");
  u.searchParams.set("maxResults", String(MAIL_MAX));
  const list = await api<{ messages?: { id: string; threadId: string }[] }>(cfg, u.toString());
  let posted = 0;
  const threads = new Set<string>();
  for (const ref of list.messages ?? []) {
    if (seen.has(ref.id) || threads.has(ref.threadId)) continue;
    threads.add(ref.threadId);
    seen.add(ref.id);
    const link = `https://mail.google.com/mail/u/0/#inbox/${ref.threadId}`;
    const dup = await prisma.inboxItem.findFirst({ where: { agent: "gmail", link }, select: { id: true } });
    if (dup) continue;
    const m = await api<GMessage>(cfg, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`);
    const subject = header(m, "Subject").trim() || "(no subject)";
    const from = fromName(header(m, "From")) || "Someone";
    await prisma.inboxItem.create({
      data: {
        agent: "gmail",
        kind: "update",
        title: `Email: ${subject.slice(0, 160)}`,
        body: [from, (m.snippet ?? "").trim().slice(0, 240) || null].filter(Boolean).join(" · "),
        link,
      },
    });
    posted++;
  }
  cfg.seenMail = [...seen].slice(-500);
  return { mail: posted };
}

// ── Sync ─────────────────────────────────────────────────────────────────────

export async function syncGoogle(opts: { force?: boolean; tz?: string } = {}) {
  if (!googleConfigured()) return { skipped: "not configured" as const };
  const row = await prisma.syncSource.findUnique({ where: { type_name: SOURCE } });
  const cfg = ((row?.config ?? {}) as Config) || {};
  if (!cfg.refreshToken) return { skipped: "not connected" as const };
  if (!opts.force && row?.lastSyncAt && Date.now() - row.lastSyncAt.getTime() < THROTTLE_MS) return { skipped: "recent" as const };

  const tz = opts.tz ?? (await prisma.user.findFirst({ select: { timezone: true } }))?.timezone ?? "America/New_York";
  const people = await prisma.person.findMany({ select: { id: true, name: true } });
  try {
    const cal = await syncCalendar(cfg, tz, people, cfg.email ?? null);
    const mail = await syncGmail(cfg).catch((e: Error) => ({ mail: 0, mailError: e.message }));
    await prisma.syncSource.update({
      where: { type_name: SOURCE },
      data: { config: cfg as object, lastSyncAt: new Date(), lastSyncStatus: "success", lastSyncError: "mailError" in mail ? `Gmail: ${mail.mailError}` : null },
    });
    const result = { ...cal, mail: mail.mail };
    void logSignal("sync", { source: "google", data: result });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google sync failed";
    void logSignal("sync", { source: "google", data: { error: message } });
    await prisma.syncSource.update({ where: { type_name: SOURCE }, data: { config: cfg as object, lastSyncAt: new Date(), lastSyncStatus: "error", lastSyncError: message } });
    return { error: message };
  }
}
