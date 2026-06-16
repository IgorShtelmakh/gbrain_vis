import { NextResponse } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const nextRaw = String(form.get("next") ?? "/");
  // Only allow same-site path redirects (no open-redirect to other hosts).
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";

  const expected = process.env.PASSWORD;
  if (!expected || password !== expected) {
    // Relative Location: the browser resolves it against its own origin, which
    // is correct behind the reverse proxy (request.url is the internal host).
    const back = `/login?error=1&next=${encodeURIComponent(next)}`;
    return new NextResponse(null, { status: 303, headers: { Location: back } });
  }

  // 303 so the browser issues a GET to the destination after this POST.
  const res = new NextResponse(null, { status: 303, headers: { Location: next } });
  res.cookies.set(AUTH_COOKIE, authToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
