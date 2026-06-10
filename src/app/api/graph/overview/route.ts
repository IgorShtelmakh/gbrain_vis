import { NextRequest, NextResponse } from "next/server";
import { getOverview } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") ?? "400", 10) || 400,
    1500
  );
  try {
    return NextResponse.json(await getOverview(limit));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "overview failed" }, { status: 500 });
  }
}
