// Public login screen — standalone (no nav), gated routes redirect here.
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const next = sp.next ?? "/";

  return (
    <div className="grid min-h-dvh place-items-center bg-[#080b14] px-4 text-slate-200">
      <form
        method="post"
        action="/api/auth/login"
        className="panel w-full max-w-sm space-y-4 p-6"
      >
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">🧠</span>
          <span className="text-base font-semibold tracking-tight text-slate-100">
            gbrain<span className="text-violet-400">·</span>explorer
          </span>
        </div>
        <p className="text-sm text-slate-500">
          Enter the password to access the explorer.
        </p>

        <input type="hidden" name="next" value={next} />
        <input
          type="password"
          name="password"
          autoFocus
          required
          placeholder="Password"
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-violet-500/50"
        />

        {sp.error && (
          <p className="text-xs text-rose-400">Incorrect password — try again.</p>
        )}

        <button
          type="submit"
          className="w-full rounded-lg bg-violet-500/20 py-2 text-sm font-medium text-violet-200 transition-colors hover:bg-violet-500/30"
        >
          Enter
        </button>
      </form>
    </div>
  );
}
