import { useState } from "react";
import type { Block, Section } from "../model/types";
import { useEditor } from "../state/store";
import { ShareDialog } from "./ShareDialog";

export function ShareButton({ section, block }: { section: Section; block?: Block }) {
  const { state } = useEditor();
  const [open, setOpen] = useState(false);
  return (
    <section className="inspector-group">
      <button className="btn btn--small btn--block" onClick={() => setOpen(true)}>
        ⇪ Export or share {block ? "this block" : "this section"}…
      </button>
      <p className="field-hint">As an embed for any site builder, a Web Component, a Shopify section or a WordPress pattern, or on CodePen.</p>
      {open && <ShareDialog site={state.site} piece={{ section, block }} onClose={() => setOpen(false)} />}
    </section>
  );
}
