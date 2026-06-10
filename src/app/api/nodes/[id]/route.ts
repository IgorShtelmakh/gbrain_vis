import { NextRequest, NextResponse } from "next/server";
import { getNodeDetail } from "@/lib/queries";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const nodeId = parseInt(id, 10);
  if (!Number.isFinite(nodeId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  try {
    const detail = await getNodeDetail(nodeId);
    if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "detail failed" }, { status: 500 });
  }
}
