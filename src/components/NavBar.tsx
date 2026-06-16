"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Overview" },
  { href: "/search", label: "Search" },
  { href: "/history", label: "History" },
  { href: "/types", label: "Content types" },
  { href: "/tags", label: "Tags" },
] as const;

/**
 * Floating brand + section tabs. Rendered inside the Overview header and at the
 * top of the section pages, so it's the single source of truth for navigation.
 */
export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="panel flex items-center gap-1 p-1.5">
      <Link
        href="/"
        className="flex items-center gap-1.5 pl-1.5 pr-2.5 shrink-0"
        aria-label="gbrain explorer — Overview"
      >
        <span className="text-lg leading-none">🧠</span>
        <span className="text-sm font-semibold text-slate-100 tracking-tight hidden sm:inline">
          gbrain<span className="text-violet-400">·</span>explorer
        </span>
      </Link>
      <div className="flex items-center gap-0.5">
        {TABS.map((tab) => {
          const active =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-violet-500/20 text-violet-200"
                  : "text-slate-400 hover:text-slate-100 hover:bg-white/5"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      <form action="/api/auth/logout" method="post" className="ml-0.5">
        <button
          type="submit"
          title="Log out"
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
        >
          Log out
        </button>
      </form>
    </nav>
  );
}
