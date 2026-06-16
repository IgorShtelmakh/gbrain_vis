import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";

export async function POST() {
  // Relative Location so it resolves against the browser's origin behind the proxy.
  const res = new NextResponse(null, { status: 303, headers: { Location: "/login" } });
  res.cookies.set(AUTH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
