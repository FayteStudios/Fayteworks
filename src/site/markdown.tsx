import type { ReactNode } from "react";
import type { RenderContext } from "./renderContext";
import { RichText } from "./richText";

type Block =
  | { kind: "h"; level: number; text: string }
  | { kind: "p"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "img"; src: string; alt: string; caption: string }
  | { kind: "code"; text: string }
  | { kind: "hr" };

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith("```"); i++) code.push(lines[i]);
      out.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    if (!trimmed) {
      flush();
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flush();
      out.push({ kind: "h", level: Math.min(5, heading[1].length + 1), text: heading[2].replace(/\s+#+$/, "") });
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flush();
      out.push({ kind: "hr" });
      continue;
    }
    const image = /^!\[([^\]]*)\]\(\s*(\S+?)(?:\s+"([^"]*)")?\s*\)$/.exec(trimmed);
    if (image) {
      flush();
      out.push({ kind: "img", alt: image[1], src: image[2], caption: image[3] ?? "" });
      continue;
    }
    if (trimmed.startsWith(">")) {
      flush();
      const quote: string[] = [];
      for (; i < lines.length && lines[i].trim().startsWith(">"); i++) quote.push(lines[i].trim().replace(/^>\s?/, ""));
      i--;
      out.push({ kind: "quote", text: quote.join(" ") });
      continue;
    }
    const bullet = /^[-*+]\s+/;
    const numbered = /^\d+[.)]\s+/;
    if (bullet.test(trimmed) || numbered.test(trimmed)) {
      flush();
      const kind = bullet.test(trimmed) ? "ul" : "ol";
      const re = kind === "ul" ? bullet : numbered;
      const items: string[] = [];
      for (; i < lines.length; i++) {
        const t = lines[i].trim();
        if (re.test(t)) items.push(t.replace(re, ""));
        else if (t && items.length && /^\s{2,}/.test(lines[i])) items[items.length - 1] += ` ${t}`;
        else break;
      }
      i--;
      out.push({ kind, items });
      continue;
    }
    para.push(trimmed);
  }
  flush();
  return out;
}

function Inline({ text, ctx }: { text: string; ctx: RenderContext }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => (part.startsWith("`") && part.endsWith("`") && part.length > 2 ? <code key={i}>{part.slice(1, -1)}</code> : part ? <RichText key={i} text={part} ctx={ctx} /> : null))}
    </>
  );
}

const safeImage = (src: string) => /^(https?:\/\/|asset:|data:image\/|\/|\.\.?\/)/i.test(src);

export function Markdown({ text, ctx }: { text: string; ctx: RenderContext }): ReactNode {
  return parseMarkdown(text).map((b, i) => {
    switch (b.kind) {
      case "h": {
        const Tag = `h${b.level}` as "h2";
        return (
          <Tag key={i}>
            <Inline text={b.text} ctx={ctx} />
          </Tag>
        );
      }
      case "p":
        return (
          <p key={i}>
            <Inline text={b.text} ctx={ctx} />
          </p>
        );
      case "quote":
        return (
          <blockquote key={i}>
            <Inline text={b.text} ctx={ctx} />
          </blockquote>
        );
      case "ul":
      case "ol": {
        const Tag = b.kind;
        return (
          <Tag key={i}>
            {b.items.map((item, j) => (
              <li key={j}>
                <Inline text={item} ctx={ctx} />
              </li>
            ))}
          </Tag>
        );
      }
      case "img": {
        const src = safeImage(b.src) ? ctx.asset(b.src) : "";
        return src ? (
          <figure key={i}>
            <img src={src} alt={b.alt} loading="lazy" />
            {b.caption && <figcaption>{b.caption}</figcaption>}
          </figure>
        ) : null;
      }
      case "code":
        return (
          <pre key={i}>
            <code>{b.text}</code>
          </pre>
        );
      case "hr":
        return <hr key={i} />;
    }
  });
}

export function markdownText(src: string): string {
  return parseMarkdown(src)
    .map((b) => ("items" in b ? b.items.join(" ") : b.kind === "img" ? b.alt : b.kind === "hr" ? "" : b.text))
    .join(" ")
    .replace(/\*\*|__|`|\[([^\]]*)\]\([^)]*\)/g, (m, label) => label ?? "")
    .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

export function readingMinutes(src: string): number {
  return Math.max(1, Math.round(markdownText(src).split(" ").length / 220));
}
