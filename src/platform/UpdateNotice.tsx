import { useEffect, useState } from "react";
import { desktop, type UpdateStatus } from "./desktop";

const CHECK_EVENT = "fayteworks:check-updates";

export function checkForUpdatesNow() {
  window.dispatchEvent(new Event(CHECK_EVENT));
}

function KeyNotice({ repo, onDone }: { repo: string; onDone: () => void }) {
  const [key, setKey] = useState("");
  const [status, setStatus] = useState("");
  return (
    <form
      className="update-notice update-notice--key"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!key.trim()) return;
        try {
          await desktop!.setToken("updates", key.trim());
          setStatus("Saved. Checking for updates…");
          await desktop!.checkUpdates();
          onDone();
        } catch (error) {
          setStatus(error instanceof Error ? error.message : String(error));
        }
      }}
    >
      <span>
        This build updates from <strong>{repo}</strong>. Paste a GitHub token that can read it:
      </span>
      <input type="password" aria-label="Update key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="github_pat_…" autoComplete="off" />
      <button className="btn btn--small btn--primary" type="submit">
        Save
      </button>
      <button className="btn btn--small btn--ghost" type="button" onClick={onDone}>
        Later
      </button>
      {status && <small>{status}</small>}
    </form>
  );
}

export function UpdateNotice() {
  const [version, setVersion] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [checked, setChecked] = useState<UpdateStatus | "checking" | null>(null);
  useEffect(() => desktop?.onUpdateReady((info) => setVersion(info.version)), []);
  useEffect(() => desktop?.onUpdateNeedsKey((info) => setNeedsKey(info.repo)), []);
  useEffect(() => {
    const run = () => {
      if (!desktop) return;
      setChecked("checking");
      void desktop.checkUpdates().then(setChecked, (error: unknown) => setChecked({ status: "error", current: "", message: error instanceof Error ? error.message : String(error) }));
    };
    window.addEventListener(CHECK_EVENT, run);
    return () => window.removeEventListener(CHECK_EVENT, run);
  }, []);
  if (needsKey && !version) return <KeyNotice repo={needsKey} onDone={() => setNeedsKey(null)} />;
  if (checked && !version) {
    const c = checked;
    return (
      <div className="update-notice" role="status">
        <span>
          {c === "checking"
            ? "Checking for updates…"
            : c.status === "current"
              ? `You're up to date (${c.current}).`
              : c.status === "downloading"
                ? `Downloading ${c.latest}… You'll get a Restart button when it's ready.`
                : c.status === "dev"
                  ? "Updates only work in the installed app."
                  : c.status === "needs-key"
                    ? "This build needs an update key first."
                    : `Couldn't check for updates: ${c.message}`}
        </span>
        {c !== "checking" && c.status === "error" && c.badKey && c.repo && (
          <button
            className="btn btn--small btn--primary"
            onClick={() => {
              setChecked(null);
              setNeedsKey(c.repo!);
            }}
          >
            Replace the update key
          </button>
        )}
        {c !== "checking" && (
          <button className="btn btn--small btn--ghost" onClick={() => setChecked(null)}>
            OK
          </button>
        )}
      </div>
    );
  }
  if (!version || hidden) return null;
  return (
    <div className="update-notice" role="status">
      <span>
        FayteWorks <strong>{version}</strong> is ready.
      </span>
      <button className="btn btn--small btn--primary" onClick={() => void desktop?.installUpdate()}>
        Restart to update
      </button>
      <button className="btn btn--small btn--ghost" title="It installs next time you quit" onClick={() => setHidden(true)}>
        Later
      </button>
    </div>
  );
}
