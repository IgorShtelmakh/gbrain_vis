import type { ReactNode } from "react";
import NavBar from "./NavBar";

/**
 * Page chrome for the non-graph sections (History, Content types): its own
 * scroll container (the global `body` is `overflow:hidden` for the full-screen
 * graph), a sticky nav header, and a centered content column.
 */
export default function SectionShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="h-dvh overflow-y-auto bg-[#080b14] text-slate-200">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#080b14]/80 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-5 py-3">
          <NavBar />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}
