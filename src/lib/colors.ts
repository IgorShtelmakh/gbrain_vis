// Stable per-type colors, shared by the WebGL graph (client) and the
// server-rendered section pages. Kept free of "use client" so React Server
// Components can import it directly.
export const TYPE_COLORS: Record<string, string> = {
  concept: "#8b7cf6",
  "php-source": "#f59e0b",
  person: "#34d399",
  company: "#38bdf8",
  note: "#f472b6",
};

const FALLBACK_COLORS = ["#22d3ee", "#fb7185", "#a3e635", "#fbbf24", "#c084fc"];
const colorCache = new Map<string, string>();

export function typeColor(type: string): string {
  if (TYPE_COLORS[type]) return TYPE_COLORS[type];
  if (!colorCache.has(type)) {
    colorCache.set(type, FALLBACK_COLORS[colorCache.size % FALLBACK_COLORS.length]);
  }
  return colorCache.get(type)!;
}
