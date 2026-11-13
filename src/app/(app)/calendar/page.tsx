import { prisma } from "@/lib/prisma";
import CalendarView, { type Connection } from "@/components/calendar/CalendarView";
import { isLockedSource } from "@/lib/calendar-utils";
import { getFeedEvents } from "@/lib/calendar-feeds";
import { resolveTz } from "@/lib/hub-data";
import { googleStatus } from "@/lib/google";
import { calendlyStatus } from "@/lib/calendly";
import { fathomStatus } from "@/lib/fathom";
import { scheduleBackgroundSyncs } from "@/lib/background-sync";
import type { CalendarEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

function since(iso: string | null) {
  if (!iso) return "not pulled yet";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "pulled just now";
  if (mins < 60) return `pulled ${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `pulled ${h}h ago` : `pulled ${Math.round(h / 24)}d ago`;
}

async function connections(): Promise<Connection[]> {
  const [g, c, f] = await Promise.all([googleStatus(), calendlyStatus(), fathomStatus()]);
  const google: Connection = !g.configured
    ? { id: "google", label: "Google Calendar", state: "off", detail: "not set up", action: { label: "How to connect", href: "/settings" } }
    : !g.connected
      ? { id: "google", label: "Google Calendar", state: "off", detail: "not connected", action: { label: "Connect", href: "/api/google/auth" } }
      : g.lastSyncStatus === "error"
        ? { id: "google", label: "Google Calendar", state: "error", detail: g.lastSyncError ?? "last pull failed", action: { label: "Reconnect", href: "/api/google/auth" } }
        : !g.canWrite
          ? { id: "google", label: "Google Calendar", state: "limited", detail: "read-only", action: { label: "Reconnect to add events", href: "/api/google/auth" } }
          : { id: "google", label: "Google Calendar", state: "on", detail: `two-way · ${since(g.lastSyncAt)}` };
  const simple = (id: "calendly" | "fathom", label: string, s: { configured: boolean; lastSyncAt: string | null; lastSyncStatus: string | null; lastSyncError: string | null }, what: string): Connection =>
    !s.configured
      ? { id, label, state: "off", detail: "not set up", action: { label: "How to connect", href: "/settings" } }
      : s.lastSyncStatus === "error"
        ? { id, label, state: "error", detail: s.lastSyncError ?? "last pull failed" }
        : { id, label, state: "on", detail: `${what} · ${since(s.lastSyncAt)}` };
  return [google, simple("calendly", "Calendly", c, "bookings"), simple("fathom", "Fathom", f, "call recordings")];
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const tz = await resolveTz(null);
  scheduleBackgroundSyncs(tz);
  const [events, categories, people, feed, conns, params] = await Promise.all([
    prisma.calendarEvent.findMany({
      include: { category: true, person: true, task: { select: { id: true, title: true, status: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.person.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getFeedEvents(tz).catch(() => ({ events: [] as CalendarEvent[], errors: [] as string[], count: 0 })),
    connections(),
    searchParams,
  ]);

  const own: CalendarEvent[] = JSON.parse(JSON.stringify(events.map((e) => ({ ...e, readOnly: isLockedSource(e.source) }))));
  const day = typeof params.day === "string" ? params.day : null;

  return <CalendarView initialEvents={[...own, ...feed.events]} categories={categories} people={people} connections={conns} initialDay={day} />;
}
