import type { BlockProps } from "../model/types";
import { sanitizeHtml, SLOT_PREFIX, type SlotKind } from "../site/customHtml";

interface SchemaSetting {
  id?: string;
  type?: string;
  label?: string;
  default?: unknown;
}

const KIND: Record<string, SlotKind> = {
  text: "text",
  inline_richtext: "text",
  textarea: "textarea",
  richtext: "textarea",
  html: "textarea",
  url: "link",
  image_picker: "image",
  color: "color",
  color_background: "color"
};

export function liquidToCode(liquid: string, name: string): { props: BlockProps; removed: number } {
  let source = liquid.replace(/\r/g, "");
  let schema: { name?: string; settings?: SchemaSetting[] } = {};
  source = source.replace(/{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/, (_, json: string) => {
    try {
      schema = JSON.parse(json);
    } catch {
    }
    return "";
  });
  const css: string[] = [];
  source = source.replace(/{%-?\s*stylesheet\s*-?%}([\s\S]*?){%-?\s*endstylesheet\s*-?%}/g, (_, c: string) => (css.push(c.trim()), ""));
  source = source.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, c: string) => (css.push(c.trim()), ""));
  source = source.replace(/{%-?\s*(javascript)\s*-?%}[\s\S]*?{%-?\s*endjavascript\s*-?%}/g, "");
  source = source.replace(/{%-?\s*comment\s*-?%}[\s\S]*?{%-?\s*endcomment\s*-?%}/g, "");

  const settings = (schema.settings ?? []).filter((s) => s.id && s.type && KIND[s.type]);
  const slots = settings.map((s) => ({ key: s.id!, label: s.label || s.id!, kind: KIND[s.type!] }));
  let removed = 0;
  source = source.replace(/{{-?\s*section\.settings\.(\w+)\s*\|[^}]*image_tag[^}]*-?}}/g, (m, id: string) => (settings.some((s) => s.id === id) ? `<img src="{{${id}}}" alt="">` : ((removed += 1), "")));
  source = source.replace(/{{-?\s*section\.settings\.(\w+)[^}]*-?}}/g, (m, id: string) => (settings.some((s) => s.id === id) ? `{{${id}}}` : ((removed += 1), "")));
  source = source.replace(/{{-?[\s\S]*?-?}}/g, (m) => (m.startsWith("{{") && /^{{[a-zA-Z_]\w*}}$/.test(m) ? m : ((removed += 1), "")));
  source = source.replace(/{%-?[\s\S]*?-?%}/g, () => ((removed += 1), ""));

  const props: BlockProps = {
    html: sanitizeHtml(source.trim()),
    css: css.join("\n\n"),
    slots,
    fit: "stretch",
    name: schema.name || name,
    author: "",
    source: "",
    copyright: "",
    licence: "Own work"
  };
  for (const s of settings) {
    const value = typeof s.default === "string" ? s.default.replace(/<\/?p>/g, "") : "";
    props[`${SLOT_PREFIX}${s.id}`] = value;
  }
  return { props, removed };
}
