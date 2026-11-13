import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { reindexPeopleAndNotes } from "@/lib/memory";

export const maxDuration = 60;

/** Puts every Person with notes and every Note back into memory. Safe to run again. */
export async function POST() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await reindexPeopleAndNotes());
}
