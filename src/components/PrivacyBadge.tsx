// ──────────────────────────────────────────────────────────────
// components/PrivacyBadge.tsx — Persistent header privacy badge
// ──────────────────────────────────────────────────────────────

export function PrivacyBadge() {
  return (
    <div className="flex items-center gap-1.5
                    bg-emerald-50 dark:bg-emerald-950/60
                    border border-emerald-200 dark:border-emerald-800/60
                    text-emerald-700 dark:text-emerald-400
                    text-xs font-medium px-3 py-1.5 rounded-full select-none shrink-0">
      <span>🔒</span>
      <span className="hidden sm:inline">Zero-Cloud Edge AI: Video stays 100% in your browser RAM</span>
      <span className="sm:hidden">Zero-Cloud · On-Device</span>
    </div>
  );
}
