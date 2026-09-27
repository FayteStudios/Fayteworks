import { BrowserWindow, ipcMain, net } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function classify(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return null;
  if (/publicdomain\/zero|cc0|creative commons zero/.test(t)) return { licence: "CC0", url: "https://creativecommons.org/publicdomain/zero/1.0/" };
  if (/publicdomain\/mark|public domain/.test(t)) return { licence: "CC0", url: "https://creativecommons.org/publicdomain/mark/1.0/" };
  if (/unlicense/.test(t)) return { licence: "CC0", url: "https://unlicense.org/" };
  if (/licenses\/by\/|\bcc[- ]by(?![- ](nc|nd|sa))\b|attribution 4\.0|attribution 3\.0/.test(t) && !/-nc|-nd|-sa|noncommercial|noderivs|sharealike/.test(t)) return { licence: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" };
  if (/licenses\/mit|\bmit license\b|^mit$/.test(t)) return { licence: "MIT", url: "https://opensource.org/licenses/MIT" };
  if (/licenses\/isc|\bisc license\b|^isc$/.test(t)) return { licence: "ISC", url: "https://opensource.org/licenses/ISC" };
  return null;
}

async function fetchJson(url) {
  try {
    const response = await net.fetch(url, { headers: { Accept: "application/json", "User-Agent": "FayteWorks" } });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function tdmReserved(pageUrl, signals) {
  if (String(signals.tdmReservation).trim() === "1") return true;
  const url = new URL(pageUrl);
  const rules = await fetchJson(`${url.origin}/.well-known/tdmrep.json`);
  if (!Array.isArray(rules)) return false;
  return rules.some((r) => {
    const loc = String(r.location || "/");
    const pattern = new RegExp(`^${loc.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}`);
    return pattern.test(url.pathname) && Number(r["tdm-reservation"]) === 1;
  });
}

async function githubLicence(pageUrl) {
  const url = new URL(pageUrl);
  const m = url.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
  if (!m) return null;
  const owner = m[1];
  const first = url.pathname.split("/").filter(Boolean)[0];
  for (const repo of [first, `${owner}.github.io`].filter(Boolean)) {
    const data = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/license`);
    if (!data?.license) continue;
    const found = classify(data.license.spdx_id === "CC0-1.0" ? "cc0" : data.license.spdx_id === "CC-BY-4.0" ? "licenses/by/" : data.license.spdx_id);
    if (!found) return { none: `${owner}/${repo} is licensed ${data.license.spdx_id}, which isn't one FayteWorks reuses.` };
    let copyright = "";
    try {
      copyright = Buffer.from(data.content || "", "base64").toString("utf8").match(/^Copyright .*$/m)?.[0] ?? "";
    } catch {
    }
    return { ...found, source: `https://github.com/${owner}/${repo}`, copyright };
  }
  return null;
}

async function decide(result) {
  const { url, title, own, signals } = result;
  const credit = { author: signals.author || title || new URL(url).hostname, source: url };
  if (own) return { status: "own", licence: "Own work", reason: "You said this is your own site, or that you have permission.", ...credit, copyright: "" };
  if (await tdmReserved(url, signals)) return { status: "reference", licence: "Reference only", reason: "The site reserves its content against reuse by software (TDM reservation).", ...credit, copyright: "" };
  const candidates = [...signals.hrefs, signals.metaLicense, ...signals.jsonLd];
  for (const c of candidates) {
    const found = classify(c);
    if (found) return { status: "open", licence: found.licence, licenceUrl: found.url, reason: `The page is marked ${found.licence}.`, ...credit, copyright: signals.metaCopyright || `© ${credit.author}` };
  }
  const gh = await githubLicence(url);
  if (gh && !gh.none) return { status: "open", licence: gh.licence, licenceUrl: gh.url, reason: `Its repository (${gh.source}) is ${gh.licence}.`, ...credit, source: url, copyright: gh.copyright || `© ${credit.author}` };
  const footer = classify(signals.footer.match(/(creative commons[^.\n]*|cc0|cc[- ]by[^\s.]*|mit license|public domain)/i)?.[0]);
  if (footer) {
    return { status: "reference", licence: "Reference only", reason: `The footer mentions ${footer.licence}, but no licence link says what it covers: kept for reference. Tick "my own site / I have permission" if you know you may reuse it.`, ...credit, copyright: "" };
  }
  return {
    status: "reference",
    licence: "Reference only",
    reason: gh?.none ?? "No licence allowing reuse was found, so its text and pictures belong to the site: you get the layout and styles to rebuild in your own way.",
    ...credit,
    copyright: ""
  };
}

export function createCapture(parent) {
  let open = null;

  return async function capture(pageUrl, options = {}) {
    let url;
    try {
      url = new URL(/^https?:\/\//i.test(pageUrl) ? pageUrl : `https://${pageUrl}`);
    } catch {
      throw new Error("That doesn't look like a web address.");
    }
    if (!/^https?:$/.test(url.protocol)) throw new Error("Only web pages (http/https) can be captured.");
    open?.close();
    const win = new BrowserWindow({
      parent,
      width: 1320,
      height: 900,
      title: "Capture: pick a component",
      webPreferences: { preload: path.join(here, "capture-preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, partition: "capture" }
    });
    open = win;
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (event, target) => {
      if (!/^https?:/i.test(target)) event.preventDefault();
    });
    const result = await new Promise((resolve) => {
      const onResult = (event, payload) => {
        if (event.sender !== win.webContents) return;
        cleanup();
        resolve(payload);
      };
      const onClosed = () => {
        cleanup();
        resolve(null);
      };
      const cleanup = () => {
        ipcMain.removeListener("capture:result", onResult);
        win.removeListener("closed", onClosed);
      };
      ipcMain.on("capture:result", onResult);
      win.on("closed", onClosed);
      win.loadURL(url.href).catch(() => {});
      if (options.own) win.webContents.on("did-finish-load", () => win.webContents.send("capture:own"));
    });
    if (!win.isDestroyed()) win.close();
    open = null;
    if (!result) return null;
    const verdict = await decide(result);
    const body = verdict.status === "reference" ? result.reference : result.full;
    return { verdict, url: result.url, title: result.title, ...body };
  };
}
