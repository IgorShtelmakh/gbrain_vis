import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

// Password gate. Runs before every matched route (Node.js runtime in Next 16,
// so process.env + node:crypto are available). If PASSWORD is unset the gate is
// disabled and the app is open.
export function proxy(request: NextRequest) {
  const password = process.env.PASSWORD;
  if (!password) return NextResponse.next();

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (token && token === authToken(password)) return NextResponse.next();

  const { pathname } = request.nextUrl;
  // The login page and its endpoints must stay reachable while unauthenticated.
  // The eval-cron endpoint is also exempt from the cookie gate — it enforces
  // its own EVAL_CRON_TOKEN so the nightly job can reach it without a login.
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/eval/run"
  ) {
    return NextResponse.next();
  }

  // API calls get a clean 401; page navigations bounce to the login screen.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on everything except Next's static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
