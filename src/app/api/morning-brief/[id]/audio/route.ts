import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const brief = await prisma.morningBrief.findUnique({
    where: { id },
    select: { audioData: true, audioMimeType: true },
  });

  if (!brief?.audioData) {
    return NextResponse.json({ error: "No audio for this brief" }, { status: 404 });
  }

  const buffer = Buffer.from(brief.audioData);
  const mimeType = brief.audioMimeType || "audio/mpeg";
  const size = buffer.length;

  const range = req.headers.get("range");
  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : size - 1;
      const chunk = buffer.subarray(start, end + 1);
      return new NextResponse(new Uint8Array(chunk), {
        status: 206,
        headers: {
          "Content-Type": mimeType,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunk.length),
          "Cache-Control": "private, max-age=3600",
        },
      });
    }
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
