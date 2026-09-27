import type { FieldDef, FieldKind } from "../model/fields";
import { fillCss, readSlots, renderCustomHtml, scopeCss, SLOT_PREFIX, type SlotKind } from "../site/customHtml";
import type { BlockDefinition } from "./types";
import { str } from "./util";

export const LICENCES = ["Own work", "CC0", "MIT", "ISC", "CC BY 4.0", "Reference only"] as const;

const SLOT_FIELD_KIND: Record<SlotKind, FieldKind> = { text: "text", textarea: "textarea", link: "link", image: "image", color: "color" };

export const codeDefinitions: BlockDefinition[] = [
  {
    type: "code",
    label: "Custom code",
    category: "Layout",
    icon: "</>",
    description: "Your own HTML and CSS (or a catalogue component). Styles stay inside the block; scripts are removed.",
    defaultSize: { w: 6, h: 6 },
    defaultProps: {
      html: '<div class="hello">\n  <strong>{{title}}</strong>\n  <p>{{text}}</p>\n</div>',
      css: ".hello {\n  padding: 1.5rem;\n  border-radius: var(--radius);\n  background: var(--surface);\n  color: var(--text);\n}",
      slots: [
        { key: "title", label: "Title", kind: "text" },
        { key: "text", label: "Text", kind: "textarea" }
      ],
      [`${SLOT_PREFIX}title`]: "Custom code",
      [`${SLOT_PREFIX}text`]: "Edit the HTML and CSS below. {{name}} placeholders become fields here.",
      fit: "center",
      tailwind: "off",
      tailwindCss: "",
      name: "",
      author: "",
      source: "",
      copyright: "",
      licence: "Own work"
    },
    fields: [
      {
        key: "fit",
        label: "Placement in the block",
        kind: "select",
        options: [
          { value: "center", label: "Centered" },
          { value: "start", label: "Top left" },
          { value: "stretch", label: "Fill the block" }
        ]
      },
      { key: "html", label: "HTML", kind: "code", hint: "Use {{name}} for editable text, links, images or colours (add them under Fields)." },
      {
        key: "tailwind",
        label: "Tailwind classes",
        kind: "select",
        options: [
          { value: "off", label: "Off" },
          { value: "on", label: "On" },
          { value: "flowbite", label: "On, with Flowbite tokens" }
        ],
        hint: "Style the HTML with Tailwind utility classes (bg-indigo-600, md:flex…). The site's theme is there too: bg-site-accent, text-site-muted, font-heading, rounded-site. Compiled to plain CSS; published sites don't load Tailwind."
      },
      { key: "css", label: "CSS", kind: "code", hint: "Only applies inside this block. Theme colours: var(--accent), var(--text), var(--surface)…" },
      {
        key: "slots",
        label: "Fields",
        kind: "list",
        itemLabel: "field",
        itemTitleKey: "label",
        newItem: { key: "field", label: "Field", kind: "text" },
        itemFields: [
          { key: "label", label: "Label", kind: "text" },
          { key: "key", label: "Placeholder name", kind: "text", hint: "Written as {{name}} in the code." },
          {
            key: "kind",
            label: "Type",
            kind: "select",
            options: [
              { value: "text", label: "Text" },
              { value: "textarea", label: "Multi-line text" },
              { value: "link", label: "Link" },
              { value: "image", label: "Image" },
              { value: "color", label: "Colour" }
            ]
          }
        ]
      },
      { key: "name", label: "Component name", kind: "text" },
      { key: "author", label: "Author", kind: "text" },
      { key: "source", label: "Source", kind: "text", placeholder: "https://…" },
      { key: "copyright", label: "Copyright line", kind: "text", placeholder: "Copyright (c) 2024 Someone" },
      {
        key: "licence",
        label: "Licence",
        kind: "select",
        options: LICENCES.map((l) => ({ value: l, label: l })),
        hint: "MIT and ISC code is credited in third-party-notices.txt when you export."
      }
    ],
    extraFields: (props) =>
      readSlots(props.slots).map(
        (slot): FieldDef => ({ key: `${SLOT_PREFIX}${slot.key}`, label: slot.label, kind: SLOT_FIELD_KIND[slot.kind] })
      ),
    mobileHeight: "content",
    render: (p, ctx, meta) => {
      const slots = readSlots(p.slots);
      const html = renderCustomHtml(str(p.html), slots, p, ctx);
      const tailwind = str(p.tailwind, "off") !== "off" ? str(p.tailwindCss) : "";
      const css = scopeCss(`${tailwind}\n${fillCss(str(p.css), slots, p, ctx)}`, `.b-code[data-code="${meta.id}"]`);
      return (
        <div className={`b-code b-code--${str(p.fit, "center")}`} data-code={meta.id} data-reference={ctx.isEditor && p.licence === "Reference only" ? "" : undefined}>
          {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
          {html.trim() ? (
            <div className="b-code-body" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            ctx.isEditor && <p className="b-code-empty">Add some HTML in the inspector.</p>
          )}
        </div>
      );
    }
  }
];
