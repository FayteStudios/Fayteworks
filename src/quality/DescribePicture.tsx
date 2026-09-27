import { useState } from "react";
import type { Block } from "../model/types";
import { lastUpload, suggestFromName } from "./altText";

export function DescribePicture({ block, mutate }: { block: Block; mutate: (recipe: (b: Block) => void, key?: string) => void }) {
  const [text, setText] = useState("");
  const [suggestion] = useState(() => (Date.now() - lastUpload.at < 30_000 ? lastUpload.suggestion || suggestFromName(lastUpload.name) : ""));
  const save = (alt: string) => mutate((b) => void (b.props.alt = alt.trim()), `${block.id}.alt`);
  return (
    <section className="inspector-group describe-picture">
      <label className="field">
        <span className="field-label">Describe this picture</span>
        <input
          type="text"
          autoFocus
          value={text}
          placeholder={suggestion || "What's in it? e.g. “Our barista pouring a flat white”"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (text.trim() || suggestion) && save(text || suggestion)}
        />
        <span className="field-hint">Read aloud to people who can't see it, and used by search engines.</span>
      </label>
      <div className="field-row">
        <button className="btn btn--small btn--primary" disabled={!text.trim() && !suggestion} onClick={() => save(text || suggestion)}>
          {text.trim() || !suggestion ? "Save" : "Use the suggestion"}
        </button>
        <button className="btn btn--small" title="Screen readers will skip it" onClick={() => mutate((b) => void (b.props.decorative = true))}>
          It's decoration
        </button>
      </div>
    </section>
  );
}
