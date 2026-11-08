import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { matchPeople } from "@/lib/quick-add-parse";

/** Fathom call recorder -> the OS. After every recorded call, the action items become
 * tasks (yours in Today, other people's as Waiting on them) and the call itself shows in
 * the agent feed with its link. Needs FATHOM_API_KEY (Fathom: Settings -> API).
 * Throttled: at most one pull every 30 minutes, tracked in SyncSource MANUAL/"fathom". */

const API = "https://api.fathom.ai/external/v1/meetings";
const SOURCE = { type: "MANUAL" as const, name: "fathom" };
const THROTTLE_MS = 30 * 60_000;
const FIRST_RUN_DAYS = 14;
const MAX_PAGES = 5;

type Invitee = { name: string | null; email: string | null; is_external?: boolean };
type ActionItem = {
  description: string;
  completed: boolean;
  user_generated?: boolean;
  recording_timestamp?: string;
  recording_playback_url?: string;
  assignee?: { name?: string | null; email?: string | null } | null;
};
type Meeting = {
  title: string | null;
  meeting_title?: string | null;
  recording_id: number;
  url: string;
  share_url: string;
  created_at: string;
  scheduled_start_time?: string | null;
  recording_start_time?: string | null;
  recorded_by?: { name?: string | null; email?: string | null } | null;
  calendar_invitees?: Invitee[];
  action_items?: ActionItem[];
};

export function fathomConfigured() {
  return Boolean(process.env.FATHOM_API_KEY?.trim());
}

export async function fathomStatus() {
  const row = await prisma.syncSource.findUnique({ where: { type_name: SOURCE } });
  return {
    configured: fathomConfigured(),
    lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: row?.lastSyncStatus ?? null,
    lastSyncError: row?.lastSyncError ?? null,
  };
}

async function fetchMeetings(createdAfter: Date): Promise<Meeting[]> {
  const key = process.env.FATHOM_API_KEY!.trim();
  const out: Meeting[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const u = new URL(API);
    u.searchParams.set("include_action_items", "true");
    u.searchParams.set("created_after", createdAfter.toISOString());
    if (cursor) u.searchParams.set("cursor", cursor);
    const res = await fetch(u, { headers: { "X-Api-Key": key }, signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 403) throw new Error("Fathom rejected the API key. Check FATHOM_API_KEY in Vercel.");
    if (!res.ok) throw new Error(`Fathom answered ${res.status}`);
    const json = (await res.json()) as { items?: Meeting[]; next_cursor?: string | null };
    out.push(...(json.items ?? []));
    cursor = json.next_cursor ?? null;
    if (!cursor) break;
  }
  return out;
}

function isMe(a: ActionItem["assignee"], myEmail: string | null, myName: string | null) {
  if (!a) return true; // unassigned items are yours to triage
  const email = a.email?.toLowerCase() ?? "";
  const name = a.name?.toLowerCase() ?? "";
  if (myEmail && email && email === myEmail.toLowerCase()) return true;
  if (myName && name && name.includes(myName.toLowerCase())) return true;
  return name.includes("abdi");
}

export async function syncFathom(opts: { force?: boolean } = {}) {
  if (!fathomConfigured()) return { skipped: "not configured" as const };
  const row = await prisma.syncSource.upsert({
    where: { type_name: SOURCE },
    update: {},
    create: { ...SOURCE, enabled: true },
  });
  if (!opts.force && row.lastSyncAt && Date.now() - row.lastSyncAt.getTime() < THROTTLE_MS) {
    return { skipped: "recent" as const };
  }

  const since = row.lastSyncAt ? new Date(row.lastSyncAt.getTime() - 86_400_000) : new Date(Date.now() - FIRST_RUN_DAYS * 86_400_000);
  const user = await prisma.user.findFirst({ select: { email: true, name: true } });
  const people = await prisma.person.findMany({ select: { id: true, name: true } });

  let calls = 0;
  let tasks = 0;
  let waiting = 0;
  try {
    const meetings = await fetchMeetings(since);
    const last = await prisma.task.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
    let position = last?.position ?? 0;

    for (const m of meetings) {
      const title = m.title || m.meeting_title || "Call";
      const when = new Date(m.recording_start_time || m.scheduled_start_time || m.created_at);
      const link = m.share_url || m.url;
      const external = (m.calendar_invitees ?? []).filter((i) => i.is_external !== false && i.name);
      const callPerson = external.map((i) => matchPeople(i.name!.toLowerCase(), people)).find(Boolean) ?? null;
      const items = (m.action_items ?? []).filter((a) => a.description?.trim() && !a.completed);

      const seen = await prisma.inboxItem.findFirst({ where: { agent: "fathom", link } , select: { id: true } });
      if (!seen) {
        await prisma.inboxItem.create({
          data: {
            agent: "fathom",
            kind: "update",
            title: `Call: ${title}`,
            body: [
              when.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
              external.map((i) => i.name).filter(Boolean).join(", ") || null,
              `${items.length} action item${items.length === 1 ? "" : "s"}`,
            ]
              .filter(Boolean)
              .join(" · "),
            link,
          },
        });
        calls++;
      }

      for (let i = 0; i < items.length; i++) {
        const a = items[i];
        const source = `fathom:${m.recording_id}:${i}`;
        const exists = await prisma.task.findFirst({ where: { source }, select: { id: true } });
        if (exists) continue;
        const mine = isMe(a.assignee, user?.email ?? null, user?.name ?? null);
        const assigneePerson = !mine && a.assignee?.name ? matchPeople(a.assignee.name.toLowerCase(), people) : null;
        if (!mine && !assigneePerson) continue; // someone we don't track promised it
        position += 1000;
        const notes = [`From the call "${title}" on ${when.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`, a.recording_playback_url || link]
          .filter(Boolean)
          .join("\n");
        const linkPerson = mine ? callPerson : assigneePerson;
        await prisma.task.create({
          data: {
            title: a.description.trim().slice(0, 300),
            notes,
            source,
            position,
            pinnedToday: mine,
            status: mine ? TaskStatus.NOT_STARTED : TaskStatus.WAITING,
            waitingAt: mine ? null : new Date(),
            followUpRequired: !mine,
            followUpPersonId: !mine && assigneePerson ? assigneePerson.id : null,
            people: linkPerson ? { create: [{ personId: linkPerson.id }] } : undefined,
          },
        });
        if (mine) tasks++;
        else waiting++;
      }
    }
    await prisma.syncSource.update({
      where: { type_name: SOURCE },
      data: { lastSyncAt: new Date(), lastSyncStatus: "success", lastSyncError: null },
    });
    return { calls, tasks, waiting };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fathom sync failed";
    await prisma.syncSource.update({
      where: { type_name: SOURCE },
      data: { lastSyncAt: new Date(), lastSyncStatus: "error", lastSyncError: message },
    });
    return { error: message };
  }
}
