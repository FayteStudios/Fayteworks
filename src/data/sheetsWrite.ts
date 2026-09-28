import type { Collection } from "../model/types";

export function newWriteKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24);
}

export function appsScriptCode(key: string): string {
  return `// FayteWorks: lets your site builder save changes into this sheet.
// Only requests that carry this key can write.
const KEY = "${key}";

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.key !== KEY) return reply({ ok: false, error: "The key doesn't match." });
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.getSheets().find((s) => String(s.getSheetId()) === String(body.gid)) || book.getSheets()[0];
  const rows = [body.headers].concat(body.rows);
  sheet.clearContents();
  if (rows.length && rows[0].length) sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  return reply({ ok: true, rows: body.rows.length });
}

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
`;
}

export async function saveToSheet(collection: Collection): Promise<string> {
  const source = collection.source;
  if (source.kind !== "sheets" || !source.writeUrl || !source.writeKey) throw new Error("Set up saving first (steps above).");
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec/.test(source.writeUrl)) throw new Error("That doesn't look like a web app address. It starts with https://script.google.com/macros/s/ and ends in /exec.");
  const gid = source.url.match(/[#&?]gid=(\d+)/)?.[1] ?? "0";
  const headers = collection.fields.map((f) => f.label || f.key);
  const rows = collection.items.map((item) => collection.fields.map((f) => {
    const v = item.values[f.key];
    return v === undefined || v === null ? "" : v;
  }));
  const body = JSON.stringify({ key: source.writeKey, gid, headers, rows });
  try {
    const response = await fetch(source.writeUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body, redirect: "follow" });
    const answer = (await response.json()) as { ok: boolean; error?: string; rows?: number };
    if (!answer.ok) throw new Error(answer.error ?? "The sheet said no.");
    return `✓ Saved ${answer.rows ?? rows.length} rows to the sheet.`;
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) {
      await fetch(source.writeUrl, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body });
      return `Sent ${rows.length} rows to the sheet. Open it to check they arrived.`;
    }
    throw error;
  }
}
