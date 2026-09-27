import { Fragment, type ReactNode } from "react";
import type { RenderContext, ResolvedLink } from "./renderContext";

export type RichNode = string | { kind: "b" | "i"; children: RichNode[] } | { kind: "a"; href: string; children: RichNode[] };

const ESCAPABLE = "\\*_[]()";
const isWordChar = (c: string | undefined) => Boolean(c && /[\p{L}\p{N}]/u.test(c));

function findUnescaped(src: string, token: string, from: number, atWordEnd = false): number {
  for (let j = from; j < src.length; j++) {
    if (src[j] === "\\" && ESCAPABLE.includes(src[j + 1] ?? "")) {
      j++;
      continue;
    }
    if (src.startsWith(token, j) && (!atWordEnd || !isWordChar(src[j + token.length]))) return j;
  }
  return -1;
}

export function parseRich(src: string): RichNode[] {
  const out: RichNode[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) out.push(buffer);
    buffer = "";
  };

  for (let i = 0; i < src.length; ) {
    const c = src[i];
    if (c === "\\" && ESCAPABLE.includes(src[i + 1] ?? "")) {
      buffer += src[i + 1];
      i += 2;
      continue;
    }
    if (src.startsWith("**", i)) {
      const end = findUnescaped(src, "**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ kind: "b", children: parseRich(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (c === "_" && !isWordChar(src[i - 1])) {
      const end = findUnescaped(src, "_", i + 1, true);
      if (end > i + 1) {
        flush();
        out.push({ kind: "i", children: parseRich(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (c === "[") {
      const close = findUnescaped(src, "]", i + 1);
      if (close > i && src[close + 1] === "(") {
        const paren = findUnescaped(src, ")", close + 2);
        if (paren > close + 1) {
          flush();
          const href = src.slice(close + 2, paren).replace(/\\([\\*_[\]()])/g, "$1");
          out.push({ kind: "a", href, children: parseRich(src.slice(i + 1, close)) });
          i = paren + 1;
          continue;
        }
      }
    }
    buffer += c;
    i++;
  }
  flush();
  return out;
}

export function escapeRich(text: string): string {
  return text.replace(/[\\*_[\]()]/g, "\\$&");
}

export function stripRich(src: string): string {
  const flatten = (nodes: RichNode[]): string => nodes.map((n) => (typeof n === "string" ? n : flatten(n.children))).join("");
  return flatten(parseRich(src));
}

export function linkAttrs(link: ResolvedLink, newTab = false) {
  return {
    href: link.href,
    "data-page-id": link.pageId,
    target: newTab ? "_blank" : undefined,
    rel: newTab || link.external ? "noopener noreferrer" : undefined
  };
}

function renderNodes(nodes: RichNode[], ctx: RenderContext): ReactNode[] {
  return nodes.map((node, i) => {
    if (typeof node === "string") return <Fragment key={i}>{node}</Fragment>;
    const children = renderNodes(node.children, ctx);
    if (node.kind !== "a") return node.kind === "b" ? <strong key={i}>{children}</strong> : <em key={i}>{children}</em>;
    const link = ctx.link(node.href);
    return (
      <a key={i} {...linkAttrs(link, link.external)}>
        {children}
      </a>
    );
  });
}

export function RichText({ text, ctx }: { text: string; ctx: RenderContext }) {
  return <>{renderNodes(parseRich(text), ctx)}</>;
}
