import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ContextSourceType } from "@prisma/client";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source");
  const q = searchParams.get("q");

  const items = await prisma.contextItem.findMany({
    where: {
      source: source ? (source as ContextSourceType) : undefined,
      content: q ? { contains: q, mode: "insensitive" } : undefined,
    },
    include: {
      person: { select: { id: true, name: true } },
      relatedTask: { select: { id: true, title: true } },
    },
    orderBy: { timestamp: "desc" },
    take: 100,
  });

  return NextResponse.json(items);
}
