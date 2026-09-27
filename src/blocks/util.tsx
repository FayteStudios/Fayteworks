import type { CSSProperties } from "react";
import type { FieldDef, FieldOption } from "../model/fields";
import type { ListItem, PropValue } from "../model/types";
import type { RenderContext } from "../site/renderContext";
import { RichText } from "../site/richText";

export const str = (value: PropValue | undefined, fallback = "") =>
  value === undefined || Array.isArray(value) ? fallback : String(value);

export const num = (value: PropValue | undefined, fallback: number) => {
  const parsed = Number(value);
  return value === undefined || value === "" || Array.isArray(value) || !Number.isFinite(parsed) ? fallback : parsed;
};

export const color = (value: PropValue | undefined) => str(value) || undefined;

export const list = (value: PropValue | undefined): ListItem[] => (Array.isArray(value) ? value : []);

export const ALIGN_OPTIONS: FieldOption[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" }
];

export const FLEX_ALIGN: Record<string, CSSProperties["justifyContent"]> = {
  left: "flex-start",
  center: "center",
  right: "flex-end"
};

export const alignField: FieldDef = { key: "align", label: "Align", kind: "select", options: ALIGN_OPTIONS };

export function Paragraphs({ text, ctx }: { text: string; ctx: RenderContext }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i}>
          <RichText text={para} ctx={ctx} />
        </p>
      ))}
    </>
  );
}
