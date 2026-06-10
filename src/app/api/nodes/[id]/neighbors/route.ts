import { NextRequest, NextResponse } from "next/server";
import { getNeighbors } from "@/lib/queries";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const nodeId = parseInt(id, 10);
  if (!Number.isFinite(nodeId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") ?? "60", 10) || 60,
    300
  );
  try {
    return NextResponse.json(await getNeighbors(nodeId, limit));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "neighbors failed" }, { status: 500 });
  }
}
