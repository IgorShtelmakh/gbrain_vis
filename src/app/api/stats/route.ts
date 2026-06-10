import { NextResponse } from "next/server";
import { getStats } from "@/lib/queries";

export async function GET() {
  try {
    return NextResponse.json(await getStats());
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "stats failed" }, { status: 500 });
  }
}
