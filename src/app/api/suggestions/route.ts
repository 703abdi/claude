import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SuggestionStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "PENDING";

  const suggestions = await prisma.suggestion.findMany({
    where: {
      status: status as SuggestionStatus,
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }],
    },
    include: {
      relatedTask: { select: { id: true, title: true, status: true } },
      relatedPerson: { select: { id: true, name: true } },
      relatedContext: { select: { id: true, content: true, source: true, sourceUrl: true, timestamp: true } },
    },
    orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(suggestions);
}
