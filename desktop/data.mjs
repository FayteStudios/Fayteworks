import { net } from "electron";

const isLocal = (u) => ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);

async function get(url, headers = {}, method = "GET", body, { keyed = false } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`That isn't a web address: ${String(url).slice(0, 80)}`);
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Only http and https addresses can be used.");
  if (keyed && parsed.protocol !== "https:" && !isLocal(parsed)) throw new Error("A key is only sent over a secure (https) connection.");
  let response;
  try {
    response = await net.fetch(url, { method, headers: { "User-Agent": "FayteWorks", ...headers }, body });
  } catch (error) {
    throw new Error(`Couldn't reach ${new URL(url).host}: ${error.message}`);
  }
  const text = await response.text();
  if (!response.ok) {
    let message = text.slice(0, 200);
    try {
      const j = JSON.parse(text);
      message = j.message || j.error?.message || j.error || message;
    } catch {
    }
    if (response.status === 401 || response.status === 403) throw new Error(`Not allowed (${message}). Check the key and what it may read.`);
    if (response.status === 404) throw new Error("Not found: check the address, path or table name.");
    throw new Error(`${response.status}: ${message}`);
  }
  return text;
}

function sheetsCsvUrl(url) {
  const id = url.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1];
  if (!id) return url;
  const gid = url.match(/[#&?]gid=(\d+)/)?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

function notionValue(p) {
  switch (p?.type) {
    case "title":
    case "rich_text":
      return (p[p.type] || []).map((t) => t.plain_text).join("");
    case "number":
      return p.number;
    case "checkbox":
      return p.checkbox;
    case "select":
      return p.select?.name ?? "";
    case "multi_select":
      return p.multi_select.map((s) => s.name).join(", ");
    case "date":
      return p.date?.start ?? "";
    case "url":
    case "email":
    case "phone_number":
      return p[p.type] ?? "";
    case "files":
      return p.files[0]?.file?.url || p.files[0]?.external?.url || "";
    default:
      return "";
  }
}

export async function fetchData(source, secret) {
  const need = (what) => {
    if (!secret) throw new Error(`Add the ${what} first.`);
    return secret;
  };
  switch (source.kind) {
    case "csv":
      return { format: "csv", text: await get(source.url) };
    case "sheets":
      return { format: "csv", text: await get(sheetsCsvUrl(source.url)) };
    case "json":
      return { format: "json", text: await get(source.url) };
    case "rest": {
      const keyed = Boolean(source.header && secret);
      if (keyed && !/^[\w-]{1,64}$/.test(source.header)) throw new Error("The header name can only use letters, numbers and dashes.");
      return { format: "json", text: await get(source.url, keyed ? { [source.header]: secret } : {}, "GET", undefined, { keyed }) };
    }
    case "github": {
      const [owner, repo] = String(source.repo).replace(/^https:\/\/github\.com\//, "").split("/");
      if (!/^[\w.-]+$/.test(owner || "") || !/^[\w.-]+$/.test(repo || "")) throw new Error("Use owner/repository, e.g. octocat/my-data.");
      const headers = { Accept: "application/vnd.github+json", ...(secret ? { Authorization: `Bearer ${secret}` } : {}) };
      const keyed = { keyed: Boolean(secret) };
      const ref = source.branch ? `?ref=${encodeURIComponent(source.branch)}` : "";
      const path = String(source.path || "").replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
      const base = "https://api.github.com";
      const listing = JSON.parse(await get(`${base}/repos/${owner}/${repo}/contents/${path}${ref}`, headers, "GET", undefined, keyed));
      const decode = (f) => Buffer.from(f.content || "", "base64").toString("utf8");
      if (!Array.isArray(listing)) {
        const text = decode(listing);
        return { format: /\.csv$/i.test(listing.name) ? "csv" : /\.(md|markdown)$/i.test(listing.name) ? "markdown" : "json", text, files: [{ name: listing.name, text }] };
      }
      const markdown = listing.filter((f) => f.type === "file" && /\.(md|markdown)$/i.test(f.name)).slice(0, 300);
      const files = [];
      for (const f of markdown) {
        if (!String(f.url).startsWith(`${base}/`)) continue;
        files.push({ name: f.name, text: decode(JSON.parse(await get(f.url, headers, "GET", undefined, keyed))) });
      }
      return { format: "markdown", files };
    }
    case "airtable": {
      const token = need("Airtable personal access token");
      const rows = [];
      let offset = "";
      do {
        const q = new URLSearchParams({ pageSize: "100", ...(source.view ? { view: source.view } : {}), ...(offset ? { offset } : {}) });
        const page = JSON.parse(await get(`https://api.airtable.com/v0/${encodeURIComponent(source.base)}/${encodeURIComponent(source.table)}?${q}`, { Authorization: `Bearer ${token}` }, "GET", undefined, { keyed: true }));
        for (const r of page.records) {
          const fields = { ...r.fields };
          for (const [k, v] of Object.entries(fields)) if (Array.isArray(v) && v[0]?.url) fields[k] = v[0].url;
          rows.push(fields);
        }
        offset = page.offset || "";
      } while (offset && rows.length < 5000);
      return { format: "rows", rows };
    }
    case "notion": {
      const token = need("Notion integration secret");
      const rows = [];
      let cursor;
      do {
        const page = JSON.parse(
          await get(
            `https://api.notion.com/v1/databases/${encodeURIComponent(String(source.database).replace(/-/g, ""))}/query`,
            { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
            "POST",
            JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
            { keyed: true }
          )
        );
        for (const r of page.results) rows.push(Object.fromEntries(Object.entries(r.properties).map(([k, p]) => [k, notionValue(p)])));
        cursor = page.has_more ? page.next_cursor : undefined;
      } while (cursor && rows.length < 5000);
      return { format: "rows", rows };
    }
    case "supabase": {
      const key = need("Supabase key");
      const base = String(source.url).replace(/\/+$/, "");
      return { format: "json", text: await get(`${base}/rest/v1/${encodeURIComponent(source.table)}?select=*`, { apikey: key, Authorization: `Bearer ${key}` }, "GET", undefined, { keyed: true }) };
    }
    default:
      throw new Error("Nothing to fetch for this collection (its items are typed in).");
  }
}
