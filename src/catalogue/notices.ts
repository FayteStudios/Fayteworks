import { allSections } from "../model/ops";
import type { Site } from "../model/types";

const LICENCE_TEXT: Record<string, string> = {
  CC0: "Dedicated to the public domain under CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/). No credit is required; listed as a courtesy.",
  "Public domain": "Marked as free of known copyright restrictions (Public Domain Mark 1.0, https://creativecommons.org/publicdomain/mark/1.0/). Listed as a courtesy.",
  "CC BY 4.0": `Licensed under the Creative Commons Attribution 4.0 International licence (CC BY 4.0): https://creativecommons.org/licenses/by/4.0/
Changes may have been made from the original.`,
  MIT: `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`,
  ISC: `Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`
};

export function thirdPartyNotices(site: Site): string | null {
  const entries = new Map<string, { licence: string; copyright: string; lines: string[] }>();
  const add = (licence: string, copyright: string, line: string) => {
    const key = `${licence}\u0000${copyright}`;
    const entry = entries.get(key) ?? { licence, copyright, lines: [] };
    if (!entry.lines.includes(line)) entry.lines.push(line);
    entries.set(key, entry);
  };
  for (const block of allSections(site).flatMap((section) => section.blocks)) {
    if (block.type !== "code") continue;
    const licence = String(block.props.licence ?? "");
    if (LICENCE_TEXT[licence]) {
      const copyright = String(block.props.copyright || (block.props.author ? `Copyright (c) ${block.props.author}` : ""));
      add(licence, copyright, `- ${block.props.name || "Custom component"}${block.props.author ? ` by ${block.props.author}` : ""}${block.props.source ? ` (${block.props.source})` : ""}`);
    }
    if (block.props.tailwind === "on" || block.props.tailwind === "flowbite") {
      add("MIT", "Copyright (c) Tailwind Labs, Inc.", "- Tailwind CSS, compiled styles (https://github.com/tailwindlabs/tailwindcss)");
    }
    if (block.props.tailwind === "flowbite") {
      add("MIT", "Copyright (c) 2023 Bergside Inc.", "- Flowbite design tokens (https://github.com/themesberg/flowbite)");
    }
  }
  const refs = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") refs.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(allSections(site));
  walk(site.collections);
  for (const [ref, credit] of Object.entries(site.mediaCredits ?? {})) {
    if (refs.has(ref)) add(credit.license === "CC0" ? "CC0" : "Public domain", "", `- Photo “${credit.title || "untitled"}” by ${credit.creator || "unknown"} (${credit.source})`);
  }
  if (entries.size === 0) return null;
  const parts = [...entries.values()].map(
    (e) => `${e.lines.join("\n")}\n\n${e.licence}${/^(CC0|Public domain)$/.test(e.licence) ? "" : " License"}${e.copyright ? `\n${e.copyright}` : ""}\n\n${LICENCE_TEXT[e.licence]}`
  );
  return `This website uses the following third-party components and photos.\n\n${parts.join("\n\n" + "-".repeat(72) + "\n\n")}\n`;
}
