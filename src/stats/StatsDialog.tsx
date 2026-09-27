import { useEffect, useRef, useState } from "react";
import { TokenField } from "../editor/ExportDialog";
import { openGuide } from "../guides/GuideHost";
import { desktop, type SiteStats } from "../platform/desktop";
import { useEditor } from "../state/store";

export const OPEN_STATS = "fayteworks:open-stats";

const DASHBOARDS: Record<string, string> = {
  cloudflare: "https://dash.cloudflare.com/?to=/:account/web-analytics",
  fathom: "https://app.usefathom.com",
  google: "https://analytics.google.com"
};

const fmt = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : n.toLocaleString());
const duration = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);

export function StatsDialog({ onClose }: { onClose: () => void }) {
  const { state } = useEditor();
  const ref = useRef<HTMLDialogElement>(null);
  const analytics = state.site.services?.analytics;
  const provider = analytics?.provider;
  const inApp = provider === "plausible" || provider === "umami";
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  useEffect(() => ref.current?.showModal(), []);
  const refreshKey = () => void (inApp && desktop?.hasToken(provider).then(setHasKey));
  useEffect(refreshKey, [provider]);

  useEffect(() => {
    if (!inApp || !hasKey || !analytics?.id) return;
    setBusy(true);
    setError("");
    desktop!
      .platformCall("stats", provider, analytics.id, days)
      .then(setStats, (e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  }, [inApp, hasKey, days, provider, analytics?.id]);

  const max = Math.max(1, ...(stats?.series.map((s) => s.value) ?? [1]));
  return (
    <dialog ref={ref} className="dialog stats-dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>Visitors</h2>
        <div className="inbox-tools">
          {inApp && hasKey && (
            <select aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={365}>Last 12 months</option>
            </select>
          )}
          <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
      </header>
      {!provider ? (
        <div className="inbox-empty">
          <p>No visitor statistics are set up yet. Privacy-friendly services like Plausible, Umami or Cloudflare count visitors without cookies.</p>
          <button className="btn btn--primary" onClick={() => (onClose(), openGuide("stats"))}>
            📘 Show me how
          </button>
        </div>
      ) : !inApp ? (
        <div className="inbox-empty">
          <p>Your statistics are on {provider === "google" ? "Google Analytics" : provider === "cloudflare" ? "Cloudflare" : "Fathom"}. Plausible and Umami can also show them here.</p>
          <button className="btn btn--primary" onClick={() => void desktop?.openExternal(DASHBOARDS[provider])}>
            Open the dashboard ↗
          </button>
        </div>
      ) : !hasKey ? (
        <div className="inbox-empty">
          <p>
            To show {provider === "plausible" ? "Plausible" : "Umami"} statistics here, add a read-only API key. It's stored encrypted on this computer.
          </p>
          <TokenField service={provider} connected={false} onChange={refreshKey} />
        </div>
      ) : (
        <div className="stats-body">
          {error && <p className="dialog-status dialog-status--error">{error}</p>}
          {busy && !stats && <p className="field-hint">Counting…</p>}
          {stats && (
            <>
              <div className="stats-totals">
                <div>
                  <strong>{fmt(stats.visitors)}</strong>
                  <span>visitors</span>
                </div>
                <div>
                  <strong>{fmt(stats.pageviews)}</strong>
                  <span>page views</span>
                </div>
                <div>
                  <strong>{Math.round(stats.bounceRate)}%</strong>
                  <span>left after one page</span>
                </div>
                <div>
                  <strong>{duration(stats.avgDuration)}</strong>
                  <span>average visit</span>
                </div>
              </div>
              <svg className="stats-chart" viewBox={`0 0 ${Math.max(1, stats.series.length) * 10} 100`} preserveAspectRatio="none" role="img" aria-label="Visitors over time">
                {stats.series.map((s, i) => (
                  <rect key={s.date} x={i * 10 + 1} y={100 - (s.value / max) * 96} width={8} height={(s.value / max) * 96} rx={1.5}>
                    <title>{`${s.date}: ${s.value}`}</title>
                  </rect>
                ))}
              </svg>
              <div className="stats-lists">
                {[
                  ["Top pages", stats.pages],
                  ["Where they came from", stats.sources]
                ].map(([title, rows]) => (
                  <section key={title as string}>
                    <h3 className="panel-heading">{title as string}</h3>
                    <ol>
                      {(rows as SiteStats["pages"]).map((r) => (
                        <li key={r.name}>
                          <span className="stats-bar" style={{ width: `${(r.value / Math.max(1, (rows as SiteStats["pages"])[0]?.value ?? 1)) * 100}%` }} />
                          <span className="stats-name">{r.name}</span>
                          <span className="stats-value">{fmt(r.value)}</span>
                        </li>
                      ))}
                      {!(rows as SiteStats["pages"]).length && <li className="field-hint">Nothing yet.</li>}
                    </ol>
                  </section>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
