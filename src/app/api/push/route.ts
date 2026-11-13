import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getVapid, removeSubscription, saveSubscription } from "@/lib/push";

export const dynamic = "force-dynamic";

const subSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

/** The public key the browser needs, plus how many devices are on. Session only (proxy). */
export async function GET() {
  const vapid = await getVapid();
  const devices = await prisma.pushSubscription.count();
  return NextResponse.json({ publicKey: vapid.publicKey, devices });
}

/** This device turned notifications on. */
export async function POST(req: NextRequest) {
  const parsed = subSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  await saveSubscription(parsed.data, req.headers.get("user-agent"));
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** This device turned notifications off. */
export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  await removeSubscription(body.endpoint);
  return NextResponse.json({ ok: true });
}
