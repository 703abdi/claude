import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getFeedEvents, getFeedUrls, maskFeedUrl, setFeedUrls } from "@/lib/calendar-feeds";
import { resolveTz } from "@/lib/hub-data";

export const dynamic = "force-dynamic";

/** Calendar feeds (read-only ICS URLs). GET lists masked URLs plus the last sync result;
 * PATCH replaces the list. Session auth only: the URLs are secrets. */
export async function GET(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const urls = await getFeedUrls();
  const tz = await resolveTz(req.nextUrl.searchParams.get("tz"));
  const { events, errors } = urls.length ? await getFeedEvents(tz) : { events: [], errors: [] };
  return NextResponse.json({ feeds: urls.map(maskFeedUrl), count: urls.length, events: events.length, errors });
}

const schema = z.object({
  urls: z.array(z.string().trim().url().max(2000).refine((u) => /^(https?|webcal):\/\//i.test(u), "must be an http(s) or webcal URL")).max(10),
});

export async function PATCH(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const urls = await setFeedUrls(parsed.data.urls.map((u) => u.replace(/^webcal:\/\//i, "https://")));
  return NextResponse.json({ feeds: urls.map(maskFeedUrl), count: urls.length });
}
