import type { Collection, DataSource } from "../model/types";
import { desktop } from "../platform/desktop";
import { jsonRows, parseCsv, parseMarkdown, rowsToCollection, sheetsCsvUrl } from "./model";

export interface RawData {
  format: "csv" | "json" | "markdown" | "rows";
  text?: string;
  files?: { name: string; text: string }[];
  rows?: Record<string, unknown>[];
}

export const SOURCE_KINDS: { kind: DataSource["kind"]; label: string; secret?: string; desktopOnly?: boolean; help: string }[] = [
  { kind: "manual", label: "Typed in here", help: "Add and edit items in the table." },
  { kind: "csv", label: "CSV file or link", help: "Upload a .csv, or a link to one (a spreadsheet export)." },
  { kind: "sheets", label: "Google Sheets", help: "Share the sheet as “anyone with the link can view”, and paste its link." },
  { kind: "json", label: "JSON link", help: "Any address that returns a list of items (set the path to the list if it's nested)." },
  { kind: "github", label: "GitHub repository", secret: "GitHub token (only for private repositories)", help: "A .json or .csv file, or a folder of Markdown posts with front matter." },
  { kind: "airtable", label: "Airtable", secret: "Airtable personal access token (data.records:read)", desktopOnly: true, help: "Base id (app…), table name, and optionally a view." },
  { kind: "notion", label: "Notion database", secret: "Notion integration secret (share the database with the integration)", desktopOnly: true, help: "The database id from its link." },
  { kind: "supabase", label: "Supabase table", secret: "Supabase anon key (with read policies) or service key", desktopOnly: true, help: "Project URL and table name." },
  { kind: "rest", label: "REST API", secret: "API key (sent in the header you name)", desktopOnly: true, help: "Any JSON API; optional header name for the key (e.g. Authorization or X-API-Key)." }
];

async function browserFetch(source: DataSource): Promise<RawData> {
  const text = async (url: string) => {
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new Error("The browser wasn't allowed to read that address (it doesn't permit other sites). The desktop app can.");
    }
    if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
    return response.text();
  };
  switch (source.kind) {
    case "csv":
      if (!source.url) throw new Error("Upload a CSV file, or give a link to one.");
      return { format: "csv", text: await text(source.url) };
    case "sheets":
      return { format: "csv", text: await text(sheetsCsvUrl(source.url)) };
    case "json":
      return { format: "json", text: await text(source.url) };
    case "github": {
      const [owner, repo] = source.repo.replace(/^https:\/\/github\.com\//, "").split("/");
      const ref = source.branch ? `?ref=${encodeURIComponent(source.branch)}` : "";
      const listing = JSON.parse(await text(`https://api.github.com/repos/${owner}/${repo}/contents/${source.path.replace(/^\/+/, "")}${ref}`));
      const decode = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
      if (!Array.isArray(listing)) {
        const t = decode(listing.content);
        return { format: /\.csv$/i.test(listing.name) ? "csv" : /\.(md|markdown)$/i.test(listing.name) ? "markdown" : "json", text: t, files: [{ name: listing.name, text: t }] };
      }
      const files: { name: string; text: string }[] = [];
      for (const f of listing.filter((x: { type: string; name: string }) => x.type === "file" && /\.(md|markdown)$/i.test(x.name)).slice(0, 200)) {
        files.push({ name: f.name, text: decode(JSON.parse(await text(f.url)).content) });
      }
      return { format: "markdown", files };
    }
    default:
      throw new Error("This source needs the desktop app (its key can't be kept safe in a browser).");
  }
}

export function rawToRows(raw: RawData, path?: string): Record<string, unknown>[] {
  switch (raw.format) {
    case "csv":
      return parseCsv(raw.text ?? "");
    case "json":
      return jsonRows(JSON.parse(raw.text ?? "null"), path);
    case "markdown":
      return (raw.files ?? []).map((f) => parseMarkdown(f.text, f.name));
    case "rows":
      return raw.rows ?? [];
  }
}

export async function fetchCollection(collection: Collection): Promise<Pick<Collection, "fields" | "items" | "synced">> {
  const source = collection.source;
  const raw: RawData = desktop ? await desktop.fetchData(collection.id, source) : await browserFetch(source);
  const rows = rawToRows(raw, "path" in source ? source.path : undefined);
  if (!rows.length) throw new Error("The source returned no items.");
  return { ...rowsToCollection(rows, collection), synced: new Date().toISOString() };
}
