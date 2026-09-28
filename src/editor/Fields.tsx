import { cardLayouts } from "../model/extras";
import { isCardShell, shellOf } from "../model/shells";
import { useContext, useState } from "react";
import { PhotoPicker } from "../media/PhotoPicker";
import { noteUpload } from "../quality/altText";
import type { FieldDef } from "../model/fields";
import { resolveColor, THEME_TOKENS } from "../model/theme";
import { BACK_TO_CARDS, PAGE_LINK_PREFIX, type ListItem, type PropValue } from "../model/types";
import { stripRich } from "../site/richText";
import { assetUrl, isAssetRef, putAsset, useAssetVersion } from "../state/assets";
import { useEditor } from "../state/store";
import { FontPicker } from "./FontPicker";
import { Hint } from "./Hint";
import { ItemFieldPicker, ItemFieldsCtx, isBound } from "./cardSource";

const HEX = /^#[0-9a-f]{6}$/i;

interface ControlProps {
  field: FieldDef;
  value: PropValue | undefined;
  onChange: (value: PropValue) => void;
  allowTokens?: boolean;
}

function ColorControl({ value, onChange, allowTokens = true }: Omit<ControlProps, "field">) {
  const { state } = useEditor();
  const text = value === undefined ? "" : String(value);
  const resolved = resolveColor(text, state.site.theme);
  const token = THEME_TOKENS.find((t) => t.value === text);

  return (
    <div className="field-color">
      <div className="field-color-row">
        <label className="field-color-swatch" style={{ background: resolved || "transparent" }} title="Pick a colour">
          <input type="color" value={HEX.test(resolved) ? resolved : "#000000"} onChange={(e) => onChange(e.target.value)} />
        </label>
        <input
          type="text"
          value={token ? `Theme · ${token.label}` : text}
          placeholder="Default"
          onFocus={(e) => token && e.target.select()}
          onChange={(e) => onChange(e.target.value.startsWith("Theme · ") ? text : e.target.value)}
        />
        {text && (
          <button className="field-clear" title="Reset to default" onClick={() => onChange("")}>
            ✕
          </button>
        )}
      </div>
      {allowTokens && (
        <div className="field-tokens">
          {THEME_TOKENS.map((t) => (
            <button
              key={t.value}
              className={t.value === text ? "is-active" : undefined}
              title={t.label}
              style={{ background: String(state.site.theme[t.key]) }}
              onClick={() => onChange(t.value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ImageControl({ value, onChange, accept = "image/*", placeholder }: Omit<ControlProps, "field"> & { accept?: string; placeholder?: string }) {
  useAssetVersion();
  const [picking, setPicking] = useState(false);
  const src = value === undefined ? "" : String(value);
  const isInline = src.startsWith("data:") || isAssetRef(src);
  const isVideo = accept.startsWith("video");
  const preview = isVideo ? "" : assetUrl(src);
  return (
    <div className="field-image">
      {preview && <img src={preview} alt="" className="field-image-preview" />}
      <input
        type="text"
        value={isInline ? (isVideo ? "Uploaded video" : "Uploaded image") : src}
        placeholder={placeholder ?? "https://…"}
        readOnly={isInline}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="field-row">
        <label className="btn btn--small">
          Upload
          <input
            type="file"
            accept={accept}
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) {
                onChange(await putAsset(file));
                noteUpload(file.name);
              }
            }}
          />
        </label>
        {accept.startsWith("image") && (
          <button className="btn btn--small" title="CC0 and public-domain photos, free to use anywhere" onClick={() => setPicking(true)}>
            Free photos
          </button>
        )}
        {src && (
          <button className="btn btn--small btn--ghost" onClick={() => onChange("")}>
            Remove
          </button>
        )}
      </div>
      {picking && <PhotoPicker onPick={(ref) => onChange(ref)} onClose={() => setPicking(false)} />}
    </div>
  );
}

const CUSTOM_URL = "__url";

function LinkControl({ value, onChange }: Omit<ControlProps, "field">) {
  const { state, page } = useEditor();
  const href = value === undefined ? "" : String(value);
  const isBack = href === BACK_TO_CARDS;
  const isPage = href.startsWith(PAGE_LINK_PREFIX) || isBack;
  const cardShell = Boolean(cardLayouts) && isCardShell(shellOf(page).type);
  const pageExists = isPage && state.site.pages.some((p) => PAGE_LINK_PREFIX + p.id === href);
  return (
    <div className="field-link">
      <select
        value={isPage ? href : CUSTOM_URL}
        onChange={(e) => onChange(e.target.value === CUSTOM_URL ? "" : e.target.value)}
      >
        {state.site.pages.map((p) => (
          <option key={p.id} value={PAGE_LINK_PREFIX + p.id}>
            Page: {p.title}
          </option>
        ))}
        {(cardShell || isBack) && <option value={BACK_TO_CARDS}>Back to the cards (closes this card)</option>}
        {isPage && !isBack && !pageExists && <option value={href}>Deleted page</option>}
        <option value={CUSTOM_URL}>Web address…</option>
      </select>
      {!isPage && (
        <input type="text" value={href} placeholder="https://… or mailto:…" onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function ListControl({ field, value, onChange }: Omit<ControlProps, "allowTokens">) {
  const items: ListItem[] = Array.isArray(value) ? value : [];
  const [open, setOpen] = useState<number | null>(null);
  const label = field.itemLabel ?? "item";
  const update = (next: ListItem[]) => onChange(next);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    update(next);
    setOpen(open === from ? to : open);
  };
  const titleOf = (item: ListItem, i: number) => {
    const raw = field.itemTitleKey ? String(item[field.itemTitleKey] ?? "") : "";
    const text = stripRich(raw).trim();
    return text && !text.startsWith("asset:") && !text.startsWith("data:") ? text : `${label[0].toUpperCase()}${label.slice(1)} ${i + 1}`;
  };

  return (
    <div className="field-list-items">
      {items.map((item, i) => (
        <div key={i} className={`list-item${open === i ? " is-open" : ""}`}>
          <div className="list-item-head">
            <button className="list-item-title" onClick={() => setOpen(open === i ? null : i)}>
              <span aria-hidden>{open === i ? "▾" : "▸"}</span> {titleOf(item, i)}
            </button>
            <button title="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>
              ↑
            </button>
            <button title="Move down" disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>
              ↓
            </button>
            <button
              title={`Remove ${label}`}
              onClick={() => {
                update(items.filter((_, j) => j !== i));
                setOpen(null);
              }}
            >
              ✕
            </button>
          </div>
          {open === i && field.itemFields && (
            <FieldList
              fields={field.itemFields}
              values={item}
              onChange={(key, v) => update(items.map((it, j) => (j === i ? { ...it, [key]: v as string | number | boolean } : it)))}
            />
          )}
        </div>
      ))}
      <button
        className="btn btn--small btn--block"
        onClick={() => {
          update([...items, { ...(field.newItem ?? {}) }]);
          setOpen(items.length);
        }}
      >
        + Add {label}
      </button>
    </div>
  );
}

export function FieldControl({ field, value, onChange, allowTokens }: ControlProps) {
  switch (field.kind) {
    case "text":
      return <input type="text" value={String(value ?? "")} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case "code":
      return (
        <textarea
          className="field-code"
          rows={9}
          spellCheck={false}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Tab" || e.shiftKey) return;
            e.preventDefault();
            const t = e.currentTarget;
            const { selectionStart: start, selectionEnd: end } = t;
            t.setRangeText("  ", start, end, "end");
            onChange(t.value);
          }}
        />
      );
    case "textarea":
      return <textarea rows={4} value={String(value ?? "")} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return (
        <input
          type="number"
          value={Number(value ?? 0)}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))}
        />
      );
    case "range":
      return (
        <div className="field-range">
          <input
            type="range"
            value={Number(value ?? 0)}
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <output>{String(value ?? 0)}</output>
        </div>
      );
    case "select":
      if (field.options?.length && field.options.every((o) => o.icon))
        return (
          <div className="field-choices" role="radiogroup" aria-label={field.label}>
            {field.options.map((o) => (
              <button key={o.value} type="button" role="radio" aria-checked={String(value ?? "") === o.value} className={String(value ?? "") === o.value ? "field-choice is-active" : "field-choice"} onClick={() => onChange(o.value)}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path d={o.icon!.path} fill={`#${o.icon!.hex}`} />
                </svg>
                <span>{o.label}</span>
              </button>
            ))}
          </div>
        );
      return (
        <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "toggle":
      return <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
    case "color":
      return <ColorControl value={value} onChange={onChange} allowTokens={allowTokens} />;
    case "image":
      return <ImageControl value={value} onChange={onChange} accept={field.accept} placeholder={field.placeholder} />;
    case "link":
      return <LinkControl value={value} onChange={onChange} />;
    case "font":
      return <FontPicker value={String(value ?? "")} onChange={onChange} />;
    case "list":
      return <ListControl field={field} value={value} onChange={onChange} />;
  }
}

export interface FieldExposure {
  labelOf: (key: string) => string | null;
  toggle: (field: FieldDef) => void;
}

function ExposeButton({ label, onToggle }: { label: string | null; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`field-expose${label ? " is-exposed" : ""}`}
      title={label ? `A field of this component (${label}). Click to stop.` : "Make this a field: every placed copy can set its own value"}
      onClick={onToggle}
    >
      {label ? `◆ ${label}` : "◇ Field"}
    </button>
  );
}

interface FieldListProps {
  fields: FieldDef[];
  values: Record<string, PropValue>;
  onChange: (key: string, value: PropValue) => void;
  allowTokens?: boolean;
  expose?: FieldExposure;
}

const PICKS_FIELDS = new Set(["text", "textarea", "image", "link"]);

export function FieldList({ fields, values, onChange, allowTokens, expose }: FieldListProps) {
  const itemFields = useContext(ItemFieldsCtx);
  return (
    <div className="field-list">
      {fields.filter((field) => !field.showWhen || field.showWhen.is.includes(String(values[field.showWhen.key] ?? ""))).map((field) => (
        <div key={field.key} className={`field field--${field.kind}`}>
          <span className="field-label field-label--row">
            <span>{field.label}</span>
            {field.hint && (
              <Hint align="end">
                {field.hint}
              </Hint>
            )}
            {expose && <ExposeButton label={expose.labelOf(field.key)} onToggle={() => expose.toggle(field)} />}
          </span>
          {!(itemFields && PICKS_FIELDS.has(field.kind) && isBound(values[field.key])) && <FieldControl field={field} value={values[field.key]} onChange={(v) => onChange(field.key, v)} allowTokens={allowTokens} />}
          {PICKS_FIELDS.has(field.kind) && <ItemFieldPicker value={values[field.key]} onChange={(v) => onChange(field.key, v)} />}
        </div>
      ))}
    </div>
  );
}
