import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export type HintKind = "hint" | "tip" | "hot" | "example";

const ICON: Record<HintKind, IconName> = { hint: "info", tip: "tip", hot: "hot", example: "example" };
const LABEL: Record<HintKind, string> = { hint: "", tip: "Tip", hot: "Hot tip", example: "Example" };

export function Hint({ kind = "hint", children, label, side = "below", align = "start" }: { kind?: HintKind; children: ReactNode; label?: string; side?: "below" | "above"; align?: "start" | "end" }) {
  return (
    <span className={`hint hint--${kind} hint--${side} hint--${align}`} tabIndex={0} aria-label={label ?? (LABEL[kind] || "More about this")}>
      <Icon name={ICON[kind]} size={16} />
      {label && <span className="hint-label">{label}</span>}
      <span className="hint-bubble" role="tooltip">
        {LABEL[kind] && <strong>{LABEL[kind]}: </strong>}
        {children}
      </span>
    </span>
  );
}

export interface BadgeInfo {
  label: string;
  icon: IconName;
  meaning: string;
}

export const BADGES = {
  free: { label: "Free", icon: "check", meaning: "Costs nothing to use. The service may have paid plans for bigger sites." },
  noServer: { label: "No server", icon: "grid", meaning: "Works on any host, even free ones. Nothing to install or keep running." },
  account: { label: "Needs an account", icon: "link", meaning: "You sign up with the service (free or paid). The guide shows where." },
  markdown: { label: "Markdown", icon: "file", meaning: "Write with simple marks: **bold**, _italic_, # heading. The writing tools add them for you." },
  grows: { label: "Grows with its text", icon: "fields", meaning: "On the published site this block gets taller to fit everything in it." },
  github: { label: "Uses GitHub", icon: "folder", meaning: "Stored in a GitHub repository you own." },
  desktop: { label: "Desktop app", icon: "download", meaning: "Only in the desktop app, where keys can be kept encrypted." }
} satisfies Record<string, BadgeInfo>;

export function Badge({ info }: { info: BadgeInfo }) {
  return (
    <span className="badge" tabIndex={0}>
      <Icon name={info.icon} size={13} />
      {info.label}
      <span className="hint-bubble" role="tooltip">
        {info.meaning}
      </span>
    </span>
  );
}
