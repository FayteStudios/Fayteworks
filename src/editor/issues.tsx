import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { LayoutIssue } from "./layoutCheck";

interface IssuesContextValue {
  issues: LayoutIssue[];
  setScanned: (issues: LayoutIssue[]) => void;
  dismiss: (key: string) => void;
}

const IssuesContext = createContext<IssuesContextValue | null>(null);

const sameIssues = (a: LayoutIssue[], b: LayoutIssue[]) =>
  a.length === b.length && a.every((issue, i) => JSON.stringify(issue) === JSON.stringify(b[i]));

export function IssuesProvider({ children }: { children: ReactNode }) {
  const [scanned, setScannedState] = useState<LayoutIssue[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const setScanned = useCallback((next: LayoutIssue[]) => {
    setScannedState((prev) => (sameIssues(prev, next) ? prev : next));
  }, []);

  const dismiss = useCallback((key: string) => {
    setDismissed((prev) => new Set(prev).add(key));
  }, []);

  const value = useMemo(
    () => ({ issues: scanned.filter((issue) => !dismissed.has(issue.key)), setScanned, dismiss }),
    [scanned, dismissed, setScanned, dismiss]
  );
  return <IssuesContext.Provider value={value}>{children}</IssuesContext.Provider>;
}

export function useIssues(): IssuesContextValue {
  const ctx = useContext(IssuesContext);
  if (!ctx) throw new Error("useIssues must be used inside IssuesProvider");
  return ctx;
}
