import { NextResponse } from "next/server";
import { runExtractionPipeline } from "@/lib/context/extract";

export async function POST() {
  const result = await runExtractionPipeline(50);
  return NextResponse.json(result);
}
