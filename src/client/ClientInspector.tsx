import { useEffect, useRef, useState } from "react";
import { localizedProps, useEditingLang, writeProp } from "../i18n/i18n";
import { getBlockDefinition } from "../blocks/registry";
import { FieldList } from "../editor/Fields";
import { findPage, findSection } from "../model/ops";
import type { Block, PropValue } from "../model/types";
import { useEditor } from "../state/store";
import { createId } from "../util/id";
import { CLIENT_FIELD_KINDS, hashPin, pinMatches, setClientUnlocked, useClientLock } from "./clientMode";

export function ClientInspector() {
  const { state, page, commit } = useEditor();
  const lang = useEditingLang(state.site);
  const sel = state.selection;
  const section = sel.kind === "none" ? undefined : findSection(state.site, page.id, sel.sectionId);
  const block = sel.kind === "block" ? section?.blocks.find((b) => b.id === sel.blockId) : undefined;

  if (block && section) {
    const def = getBlockDefinition(block.type);
    const fields = [...(def?.extraFields?.(block.props, state.site) ?? []), ...(def?.fields ?? [])].filter((f) => CLIENT_FIELD_KINDS.has(f.kind));
    const setProp = (key: string, value: PropValue) =>
      commit((d) => {
        const b = findSection(d, page.id, section.id)?.blocks.find((x) => x.id === block.id) as Block | undefined;
        if (b) writeProp(b, key, value, lang, state.site);
      }, `${block.id}.${key}`);
    return (
      <div className="inspector client-inspector">
        <header className="inspector-header">
          <span className="inspector-kind">{def?.icon}</span>
          <div>
            <h2>{def?.label ?? block.type}</h2>
            <span className="inspector-sub">Double-click text on the page to edit it in place.</span>
          </div>
        </header>
        {fields.length ? (
          <section className="inspector-group">
            <FieldList fields={fields} values={lang ? localizedProps(block, lang) : block.props} onChange={setProp} />
          </section>
        ) : (
          <p className="panel-hint client-note">This part of the design is locked. Ask your web designer if it needs to change.</p>
        )}
      </div>
    );
  }

  return (
    <div className="inspector client-inspector">
      <header className="inspector-header">
        <span className="inspector-kind">◰</span>
        <div>
          <h2>{page.title}</h2>
          <span className="inspector-sub">Click text or a picture to change it.</span>
        </div>
      </header>
      <section className="inspector-group">
        <div className="field">
          <span className="field-label">Page title</span>
          <input type="text" value={page.title} onChange={(e) => commit((d) => void (findPage(d, page.id)!.title = e.target.value), `${page.id}.title`)} />
        </div>
        <div className="field">
          <span className="field-label">Search description</span>
          <textarea rows={3} value={page.seo.description} onChange={(e) => commit((d) => void (findPage(d, page.id)!.seo.description = e.target.value), `${page.id}.desc`)} />
          <span className="field-hint">One or two sentences shown under the page's title in search results.</span>
        </div>
      </section>
      <p className="panel-hint client-note">
        The design and layout are locked so nothing breaks by accident. Blog posts and lists are in the Data tab.
      </p>
    </div>
  );
}

export function ClientLockedPanel() {
  return <p className="panel-hint client-note">🔒 This is locked in client mode. Words, pictures and posts can still be changed.</p>;
}

export function ClientBadge() {
  const { state } = useEditor();
  const locked = useClientLock();
  const [asking, setAsking] = useState(false);
  if (!state.site.clientMode?.enabled) return null;
  return (
    <>
      <button className="btn btn--ghost client-badge" title={locked ? "Unlock with the PIN" : "Lock the design again"} onClick={() => (locked ? setAsking(true) : setClientUnlocked(false))}>
        {locked ? "🔒 Client mode" : "🔓 Unlocked"}
      </button>
      {asking && <PinDialog onClose={() => setAsking(false)} />}
    </>
  );
}

function PinDialog({ onClose }: { onClose: () => void }) {
  const { state } = useEditor();
  const ref = useRef<HTMLDialogElement>(null);
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(false);
  useEffect(() => ref.current?.showModal(), []);
  return (
    <dialog ref={ref} className="dialog pin-dialog" onClose={onClose} onCancel={onClose}>
      <form
        method="dialog"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await pinMatches(state.site, pin)) {
            setClientUnlocked(true);
            onClose();
          } else setWrong(true);
        }}
      >
        <h2>Unlock the design</h2>
        <p className="dialog-lead">Enter the PIN your web designer set. It unlocks everything until the app is closed.</p>
        <input type="password" inputMode="numeric" autoFocus aria-label="PIN" value={pin} onChange={(e) => (setPin(e.target.value), setWrong(false))} />
        {wrong && <p className="dialog-status dialog-status--error">That's not the PIN.</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={!pin}>
            Unlock
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function HandoverDialog({ onClose }: { onClose: () => void }) {
  const { state, commit } = useEditor();
  const ref = useRef<HTMLDialogElement>(null);
  const mode = state.site.clientMode;
  const [pin, setPin] = useState("");
  const [client, setClient] = useState(mode?.client ?? "");
  useEffect(() => ref.current?.showModal(), []);
  const pinOk = /^\d{4,8}$/.test(pin);

  async function turnOn() {
    const salt = createId("pin");
    const pinHash = await hashPin(pin, salt);
    commit((d) => void (d.clientMode = { enabled: true, pinHash, salt, client: client.trim() || undefined }));
    setClientUnlocked(false);
    onClose();
  }

  return (
    <dialog ref={ref} className="dialog handover-dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>Hand over to a client</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      {mode?.enabled ? (
        <>
          <p className="dialog-lead">Client mode is on{mode.client ? ` for ${mode.client}` : ""}. The site opens locked; your PIN unlocks it.</p>
          <div className="dialog-actions">
            <button
              className="btn"
              onClick={() => {
                commit((d) => void delete d.clientMode);
                onClose();
              }}
            >
              Turn client mode off
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="dialog-lead">
            When your client opens this site, they can change the <strong>words, pictures and links</strong>, edit page titles and descriptions, and write
            blog posts. The <strong>design, layout and structure are locked</strong>, so nothing breaks by accident. Your PIN unlocks everything.
          </p>
          <ul className="handover-list">
            <li>Run File → Check before publishing first, so they start from a clean site.</li>
            <li>Give them the project folder (desktop) or File → Save site file, and the app's download link.</li>
            <li>The lock prevents accidents; it isn't a password. Keep your own copy of the project.</li>
          </ul>
          <div className="field">
            <span className="field-label">Client's name (optional)</span>
            <input type="text" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Ember & Oak" />
          </div>
          <div className="field">
            <span className="field-label">Your PIN (4–8 digits, to unlock later)</span>
            <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} />
          </div>
          <div className="dialog-actions">
            <button className="btn btn--primary" disabled={!pinOk} onClick={() => void turnOn()}>
              Turn on client mode
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
