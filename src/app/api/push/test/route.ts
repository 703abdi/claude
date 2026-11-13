import { NextResponse } from "next/server";
import { sendPush } from "@/lib/push";

export const dynamic = "force-dynamic";

/** "Send a test" in the notifications pop-up. */
export async function POST() {
  const result = await sendPush({ title: "Notifications are on", body: "This is what a nudge from your OS looks like.", url: "/hub", tag: "test" });
  return NextResponse.json(result);
}
