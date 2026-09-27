import { useEffect, useRef, useState, useSyncExternalStore } from "react";

interface Request {
  message: string;
  initial: string;
  resolve: (value: string | null) => void;
}

let current: Request | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function askText(message: string, initial = ""): Promise<string | null> {
  current?.resolve(null);
  return new Promise((resolve) => {
    current = {
      message,
      initial,
      resolve: (value) => {
        if (current?.resolve === wrapped) current = null;
        resolve(value);
        notify();
      }
    };
    const wrapped = current.resolve;
    notify();
  });
}

export function AskTextHost() {
  const request = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!request) return;
    setValue(request.initial);
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [request]);

  if (!request) return null;
  const finish = (result: string | null) => {
    dialogRef.current?.close();
    request.resolve(result === null ? null : result.trim() || null);
  };
  return (
    <dialog ref={dialogRef} className="dialog ask-text" onCancel={(e) => (e.preventDefault(), finish(null))}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          finish(value);
        }}
      >
        <label className="field">
          <span className="field-label">{request.message}</span>
          <input type="text" autoFocus value={value} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.target.select()} />
        </label>
        <div className="field-row ask-text-actions">
          <button type="button" className="btn" onClick={() => finish(null)}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={!value.trim()}>
            OK
          </button>
        </div>
      </form>
    </dialog>
  );
}
