import { useEffect, useState } from "react";
import { desktop } from "./desktop";

export function UpdateNotice() {
  const [version, setVersion] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => desktop?.onUpdateReady((info) => setVersion(info.version)), []);
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
