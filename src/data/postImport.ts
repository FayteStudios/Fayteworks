import { parseMarkdown as frontMatter } from "./model";

export interface ImportedPost {
  title: string;
  date: string;
  excerpt: string;
  cover: string;
  tags: string;
  body: string;
}

const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? "";

export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html.replace(/<!--[\s\S]*?-->/g, "")}</body>`, "text/html");
  const inline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/\s+/g, " ").replace(/([*_[\]\\])/g, "\\$1");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    const inner = () => Array.from(el.childNodes).map(inline).join("");
    switch (el.localName) {
      case "strong":
      case "b":
        return inner().trim() ? `**${inner().trim()}**` : "";
      case "em":
      case "i":
        return inner().trim() ? `_${inner().trim()}_` : "";
      case "a": {
        const href = el.getAttribute("href") ?? "";
        return /^(https?:|mailto:|\/)/.test(href) ? `[${inner().trim() || href}](${href})` : inner();
      }
      case "code":
        return `\`${el.textContent ?? ""}\``;
      case "br":
        return "  \n";
      case "img": {
        const src = el.getAttribute("src") ?? "";
        return /^https?:/.test(src) ? `![${el.getAttribute("alt") ?? ""}](${src})` : "";
      }
      default:
        return inner();
    }
  };
  const blocks: string[] = [];
  const block = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? "").trim();
      if (t) blocks.push(t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const name = el.localName;
    if (/^h[1-6]$/.test(name)) blocks.push(`${"#".repeat(Math.max(1, Math.min(4, Number(name[1]) - 1)))} ${inline(el).trim()}`);
    else if (name === "p") {
      const t = inline(el).trim();
      if (t) blocks.push(t);
    } else if (name === "ul" || name === "ol") {
      blocks.push(
        Array.from(el.children)
          .filter((li) => li.localName === "li")
          .map((li, i) => `${name === "ol" ? `${i + 1}.` : "-"} ${inline(li).trim()}`)
          .join("\n")
      );
    } else if (name === "blockquote") blocks.push(`> ${inline(el).trim()}`);
    else if (name === "pre") blocks.push(`\`\`\`\n${el.textContent ?? ""}\n\`\`\``);
    else if (name === "hr") blocks.push("---");
    else if (name === "img") blocks.push(inline(el));
    else if (name === "figure") {
      const img = el.querySelector("img");
      const src = img?.getAttribute("src") ?? "";
      const caption = text(el.querySelector("figcaption")).replace(/"/g, "'");
      if (/^https?:/.test(src)) blocks.push(`![${img?.getAttribute("alt") ?? ""}](${src}${caption ? ` "${caption}"` : ""})`);
    } else if (["div", "section", "article", "main", "span"].includes(name)) Array.from(el.childNodes).forEach(block);
    else if (!["script", "style", "iframe", "object", "embed", "form"].includes(name)) {
      const t = inline(el).trim();
      if (t) blocks.push(t);
    }
  };
  Array.from(doc.body.childNodes).forEach(block);
  return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

const isoDate = (value: string) => {
  const d = new Date(value.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

export function wordpressPosts(xml: string): ImportedPost[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("That isn't a WordPress export file (.xml).");
  const items = Array.from(doc.getElementsByTagName("item"));
  const field = (item: Element, name: string) => text(item.getElementsByTagName(name)[0]);
  const attachments = new Map<string, string>();
  for (const item of items) if (field(item, "wp:post_type") === "attachment") attachments.set(field(item, "wp:post_id"), field(item, "wp:attachment_url"));
  return items
    .filter((item) => field(item, "wp:post_type") === "post" && field(item, "wp:status") === "publish")
    .map((item) => {
      const meta = Array.from(item.getElementsByTagName("wp:postmeta"));
      const thumbnail = meta.find((m) => field(m, "wp:meta_key") === "_thumbnail_id");
      const tags = Array.from(item.getElementsByTagName("category")).map((c) => text(c)).filter((t) => t && t !== "Uncategorized");
      return {
        title: field(item, "title") || "Untitled",
        date: isoDate(field(item, "wp:post_date") || field(item, "pubDate")),
        excerpt: htmlToMarkdown(field(item, "excerpt:encoded")).replace(/\n+/g, " "),
        cover: (thumbnail && attachments.get(field(thumbnail, "wp:meta_value"))) || "",
        tags: [...new Set(tags)].join(", "),
        body: htmlToMarkdown(field(item, "content:encoded"))
      };
    });
}

export function ghostPosts(json: string): ImportedPost[] {
  const data = JSON.parse(json);
  const db = (data.db?.[0] ?? data).data;
  if (!db?.posts) throw new Error("That isn't a Ghost export file (.json).");
  const tagNames = new Map<string, string>((db.tags ?? []).map((t: { id: string; name: string }) => [t.id, t.name]));
  const postTags = (db.posts_tags ?? []) as { post_id: string; tag_id: string }[];
  return (db.posts as Array<Record<string, string | null>>)
    .filter((p) => p.status === "published" && (p.type ?? "post") === "post")
    .map((p) => ({
      title: p.title ?? "Untitled",
      date: isoDate(p.published_at ?? ""),
      excerpt: p.custom_excerpt ?? "",
      cover: /^https?:/.test(p.feature_image ?? "") ? p.feature_image! : "",
      tags: postTags.filter((pt) => pt.post_id === p.id).map((pt) => tagNames.get(pt.tag_id)).filter(Boolean).join(", "),
      body: htmlToMarkdown(p.html ?? "")
    }));
}

export function markdownPosts(files: { name: string; text: string }[]): ImportedPost[] {
  return files.map((f) => {
    const v = frontMatter(f.text, f.name);
    return {
      title: v.title || v.slug,
      date: isoDate(v.date ?? "") || "",
      excerpt: v.summary || v.description || v.excerpt || "",
      cover: /^https?:/.test(v.cover || v.image || "") ? v.cover || v.image : "",
      tags: (v.tags ?? "").replace(/^\[|\]$/g, "").replace(/["']/g, ""),
      body: v.body ?? ""
    };
  });
}
