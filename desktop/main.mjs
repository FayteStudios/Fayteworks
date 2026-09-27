import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, safeStorage, shell } from "electron";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deployCloudflare, deployGithub, deployNetlify } from "./deploy.mjs";
import { createDrawingEditor, findVectorApps } from "./drawings.mjs";
import { createMediaEditor, findMediaApps } from "./media.mjs";
import { createCapture } from "./capture.mjs";
import { createPlatforms } from "./platforms.mjs";
import { fetchData } from "./data.mjs";
import updaterPackage from "electron-updater";

const { autoUpdater } = updaterPackage;

const here = path.dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.FAYTEWORKS_DEV_URL;
const ASSET_SCHEME = "siteasset";
const MAX_RECENT = 12;
const MIME = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  wav: "audio/wav",
  weba: "audio/webm",
  flac: "audio/flac",
  vtt: "text/vtt"
};

app.setPath("userData", path.join(app.getPath("appData"), "FayteWorks"));

protocol.registerSchemesAsPrivileged([
  { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

let project = null;

const userFile = (name) => path.join(app.getPath("userData"), name);

let lastFolder = null;
async function rememberedFolder() {
  if (lastFolder === null) lastFolder = (await readJson(userFile("prefs.json"), {})).lastFolder ?? app.getPath("documents");
  return lastFolder;
}
async function rememberFolder(folder) {
  if (!folder) return;
  lastFolder = folder;
  const prefs = await readJson(userFile("prefs.json"), {});
  await writeFileAtomic(userFile("prefs.json"), JSON.stringify({ ...prefs, lastFolder: folder }, null, 2));
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeFileAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

async function recentProjects() {
  const list = await readJson(userFile("recent-projects.json"), []);
  return list.map((p) => ({ ...p, exists: existsSync(path.join(p.path, "site.json")) }));
}

async function rememberProject(projectPath, name) {
  const list = (await readJson(userFile("recent-projects.json"), [])).filter((p) => p.path !== projectPath);
  list.unshift({ path: projectPath, name, openedAt: new Date().toISOString() });
  await writeFileAtomic(userFile("recent-projects.json"), JSON.stringify(list.slice(0, MAX_RECENT), null, 2));
}

async function forgetProject(projectPath) {
  const list = (await readJson(userFile("recent-projects.json"), [])).filter((p) => p.path !== projectPath);
  await writeFileAtomic(userFile("recent-projects.json"), JSON.stringify(list, null, 2));
}

function safeFolderName(name) {
  return String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim().replace(/[. ]+$/, "") || "My site";
}

async function indexAssets(projectPath) {
  const dir = path.join(projectPath, "assets");
  await fs.mkdir(dir, { recursive: true });
  const index = new Map();
  for (const file of await fs.readdir(dir)) index.set(file.replace(/\.[^.]+$/, ""), file);
  return index;
}

async function openProject(projectPath) {
  const siteFile = path.join(projectPath, "site.json");
  if (!existsSync(siteFile)) throw new Error("That folder isn't a FayteWorks project (it has no site.json).");
  const site = JSON.parse(await fs.readFile(siteFile, "utf8"));
  const name = site?.name || path.basename(projectPath);
  project = { path: projectPath, name, assets: await indexAssets(projectPath) };
  await rememberProject(projectPath, name);
  return { path: projectPath, name, site };
}

async function createProject(parentDir, name, siteJson) {
  const projectPath = path.join(parentDir, safeFolderName(name));
  if (existsSync(projectPath) && (await fs.readdir(projectPath)).length > 0) {
    throw new Error(`"${projectPath}" already exists and isn't empty. Pick another name or location.`);
  }
  await fs.mkdir(path.join(projectPath, "assets"), { recursive: true });
  await writeFileAtomic(path.join(projectPath, "site.json"), siteJson);
  await writeFileAtomic(
    path.join(projectPath, ".gitignore"),
    "# FayteWorks: exported site (rebuild any time with Export)\npublished/\n"
  );
  return openProject(projectPath);
}

function requireProject() {
  if (!project) throw new Error("No project is open.");
  return project;
}

async function readSecrets() {
  return readJson(userFile("secrets.json"), {});
}

async function getToken(service) {
  const stored = (await readSecrets())[service];
  if (!stored) return null;
  return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(stored, "base64")) : null;
}

async function setToken(service, token) {
  const secrets = await readSecrets();
  if (token) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("This computer can't store secrets securely, so the token wasn't saved.");
    secrets[service] = safeStorage.encryptString(token).toString("base64");
  } else {
    delete secrets[service];
  }
  await writeFileAtomic(userFile("secrets.json"), JSON.stringify(secrets));
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, value: await fn(...args) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

function registerIpc(window) {
  const drawings = createDrawingEditor({ send: (channel, data) => !window.isDestroyed() && window.webContents.send(channel, data), shell });
  const media = createMediaEditor({ send: (channel, data) => !window.isDestroyed() && window.webContents.send(channel, data), shell });
  handle("projects:recent", recentProjects);
  handle("projects:forget", forgetProject);
  handle("projects:open", openProject);
  handle("projects:create", createProject);
  handle("projects:close", async () => {
    drawings.stopAll();
    media.stopAll();
    project = null;
  });
  const dataFile = (p) => {
    const file = String(p || "");
    if (!path.isAbsolute(file) || !/\.(csv|json)$/i.test(file)) throw new Error("Only .csv and .json files can be used.");
    return file;
  };
  const readDataFile = async (file) => {
    const [text, stat] = await Promise.all([fs.readFile(file, "utf8"), fs.stat(file)]);
    return { path: file, text, modified: stat.mtimeMs };
  };
  handle("data:openFile", async () => {
    const result = await dialog.showOpenDialog(window, { title: "Choose a spreadsheet file", defaultPath: await rememberedFolder(), properties: ["openFile"], filters: [{ name: "Spreadsheet (CSV)", extensions: ["csv"] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    await rememberFolder(path.dirname(result.filePaths[0]));
    return readDataFile(dataFile(result.filePaths[0]));
  });
  handle("data:readFile", async (p) => readDataFile(dataFile(p)));
  handle("data:fileModified", async (p) => {
    try {
      return (await fs.stat(dataFile(p))).mtimeMs;
    } catch {
      return null;
    }
  });
  handle("data:writeFile", async (p, text) => {
    const file = dataFile(p);
    await writeFileAtomic(file, String(text));
    return (await fs.stat(file)).mtimeMs;
  });
  handle("data:saveAs", async (name, text) => {
    const result = await dialog.showSaveDialog(window, { title: "Save a copy", defaultPath: path.join(await rememberedFolder(), String(name).replace(/[\\/:*?"<>|]+/g, "-")), filters: [{ name: "Spreadsheet (CSV)", extensions: ["csv"] }] });
    if (result.canceled || !result.filePath) return null;
    const file = dataFile(result.filePath);
    await writeFileAtomic(file, String(text));
    await rememberFolder(path.dirname(file));
    return { path: file, modified: (await fs.stat(file)).mtimeMs };
  });
  handle("dialog:folder", async (title) => {
    const result = await dialog.showOpenDialog(window, { title, defaultPath: await rememberedFolder(), properties: ["openDirectory", "createDirectory"] });
    if (result.canceled) return null;
    await rememberFolder(path.dirname(result.filePaths[0]));
    return result.filePaths[0];
  });
  handle("project:saveSite", async (siteJson) => {
    const p = requireProject();
    await writeFileAtomic(path.join(p.path, "site.json"), siteJson);
    const name = JSON.parse(siteJson)?.name;
    if (name && name !== p.name) {
      p.name = name;
      await rememberProject(p.path, name);
    }
  });
  const versionsDir = () => path.join(requireProject().path, "versions");
  const versionIndex = async () => readJson(path.join(versionsDir(), "index.json"), []);
  const validVersionId = (id) => {
    if (!/^v\d{13}-[a-z0-9]{4}$/.test(String(id))) throw new Error("Unknown version.");
    return String(id);
  };
  handle("versions:list", async () => versionIndex());
  handle("versions:save", async (meta, siteJson) => {
    const dir = versionsDir();
    await fs.mkdir(dir, { recursive: true });
    const id = `v${Date.now()}-${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`;
    await writeFileAtomic(path.join(dir, `${id}.json`), String(siteJson));
    const entry = { id, at: new Date().toISOString(), label: String(meta?.label ?? "Version").slice(0, 120), kind: ["auto", "manual", "publish", "restore"].includes(meta?.kind) ? meta.kind : "auto", pages: Number(meta?.pages) || 0, bytes: Buffer.byteLength(String(siteJson)) };
    const list = [...(await versionIndex()), entry];
    const now = Date.now();
    const autos = list.filter((v) => v.kind !== "manual").sort((a, b) => b.at.localeCompare(a.at));
    const keep = new Set(list.filter((v) => v.kind === "manual").map((v) => v.id));
    const days = new Set();
    autos.forEach((v, i) => {
      const age = now - Date.parse(v.at);
      const day = v.at.slice(0, 10);
      if (i < 30 || (age < 90 * 864e5 && !days.has(day))) keep.add(v.id);
      days.add(day);
    });
    for (const v of list) if (!keep.has(v.id)) await fs.rm(path.join(dir, `${v.id}.json`), { force: true });
    await writeFileAtomic(path.join(dir, "index.json"), JSON.stringify(list.filter((v) => keep.has(v.id)), null, 1));
    return entry;
  });
  handle("versions:read", async (id) => fs.readFile(path.join(versionsDir(), `${validVersionId(id)}.json`), "utf8"));
  handle("versions:delete", async (id) => {
    const vid = validVersionId(id);
    await fs.rm(path.join(versionsDir(), `${vid}.json`), { force: true });
    await writeFileAtomic(path.join(versionsDir(), "index.json"), JSON.stringify((await versionIndex()).filter((v) => v.id !== vid), null, 1));
  });
  handle("project:putAsset", async (hash, ext, bytes) => {
    const p = requireProject();
    if (!/^[0-9a-f]{8,64}$/.test(hash) || !/^[a-z0-9]{1,5}$/.test(ext)) throw new Error("Invalid asset name.");
    if (!p.assets.has(hash)) {
      const file = `${hash}.${ext}`;
      await fs.writeFile(path.join(p.path, "assets", file), Buffer.from(bytes));
      p.assets.set(hash, file);
    }
  });
  handle("project:hasAsset", async (hash) => requireProject().assets.has(hash));
  handle("project:config", async () => readJson(path.join(requireProject().path, "project.json"), {}));
  handle("project:saveConfig", async (config) => {
    await writeFileAtomic(path.join(requireProject().path, "project.json"), JSON.stringify(config, null, 2));
  });
  handle("project:export", async (files, chooseFolder) => {
    const p = requireProject();
    let dir = path.join(p.path, "published");
    if (chooseFolder) {
      const result = await dialog.showOpenDialog(window, { title: "Export website to…", defaultPath: await rememberedFolder(), properties: ["openDirectory", "createDirectory"] });
      if (result.canceled) return null;
      dir = result.filePaths[0];
      await rememberFolder(dir);
    } else {
      await fs.rm(dir, { recursive: true, force: true });
    }
    for (const file of files) {
      const target = path.join(dir, file.path);
      if (!target.startsWith(dir + path.sep)) throw new Error(`Refusing to write outside the export folder: ${file.path}`);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, Buffer.from(file.data));
    }
    return dir;
  });
  handle("shell:showFolder", async (target) => {
    await shell.openPath(target ?? requireProject().path);
  });
  handle("shell:openExternal", async (url) => {
    if (!/^https?:\/\//.test(url) && !/^mailto:[^\s<>"'`]+$/.test(url)) throw new Error("Only web and email links can be opened.");
    await shell.openExternal(url);
  });
  handle("design:pdf", async (html, fileName) => {
    const result = await dialog.showSaveDialog(window, { title: "Save the PDF", defaultPath: path.join(await rememberedFolder(), fileName), filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (result.canceled || !result.filePath) return null;
    await rememberFolder(path.dirname(result.filePath));
    const temp = path.join(app.getPath("temp"), `fayteworks-print-${Date.now()}.html`);
    await fs.writeFile(temp, html, "utf8");
    const printer = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    try {
      await printer.loadFile(temp);
      await printer.webContents.executeJavaScript("document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 300)))");
      const pdf = await printer.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: "none" } });
      await fs.writeFile(result.filePath, pdf);
      return result.filePath;
    } finally {
      printer.destroy();
      await fs.rm(temp, { force: true });
    }
  });
  const capture = createCapture(window);
  handle("capture:open", (url, options) => capture(url, options));
  handle("data:fetch", async (collectionId, source) => {
    if (!/^[\w-]{1,64}$/.test(String(collectionId))) throw new Error("Invalid collection.");
    return fetchData(source, await getToken(`data:${collectionId}`));
  });
  handle("links:check", async (urls) => {
    const list = (Array.isArray(urls) ? urls : []).map(String).filter((u) => /^https?:\/\/[^\s]+$/.test(u)).slice(0, 200);
    const one = async (url) => {
      const attempt = async (method) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        try {
          return await net.fetch(url, { method, redirect: "follow", signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 (FayteWorks link check)" } });
        } finally {
          clearTimeout(timer);
        }
      };
      try {
        let response = await attempt("HEAD");
        if (response.status === 405 || response.status === 403 || response.status === 501) response = await attempt("GET");
        return { url, status: response.status, ok: response.ok };
      } catch (error) {
        return { url, status: 0, ok: false, error: error.name === "AbortError" ? "No answer (timed out)" : "Couldn't connect" };
      }
    };
    const results = [];
    for (let i = 0; i < list.length; i += 6) results.push(...(await Promise.all(list.slice(i, i + 6).map(one))));
    return results;
  });
  const platforms = createPlatforms({ getToken });
  for (const [name, fn] of Object.entries(platforms)) handle(`platform:${name}`, fn);
  handle("shell:openHtml", async (html) => {
    const file = path.join(app.getPath("temp"), `fayteworks-${Date.now()}.html`);
    await fs.writeFile(file, String(html), "utf8");
    const error = await shell.openPath(file);
    if (error) throw new Error(error);
  });
  handle("media:apps", findMediaApps);
  handle("media:edit", async (blockId, name, bytes, appPath) => media.edit(requireProject().path, blockId, name, bytes, appPath || null));
  handle("media:stop", async (blockId) => media.stop(blockId));
  handle("vector:apps", findVectorApps);
  handle("vector:chooseApp", async () => {
    const result = await dialog.showOpenDialog(window, {
      title: "Choose the program to edit drawings with",
      properties: ["openFile"],
      filters: process.platform === "win32" ? [{ name: "Programs", extensions: ["exe"] }] : []
    });
    return result.canceled ? null : result.filePaths[0];
  });
  handle("vector:edit", async (blockId, svg, appPath) => drawings.edit(requireProject().path, blockId, svg, appPath || null));
  handle("vector:stop", async (blockId) => drawings.stop(blockId));
  handle("app:version", async () => app.getVersion());
  handle("update:check", () => checkForUpdates(window));
  handle("web:fetchFile", async (url) => {
    const address = new URL(String(url));
    if (!/^https?:$/.test(address.protocol)) throw new Error("Only web addresses (http or https) can be fetched.");
    const response = await net.fetch(address.toString(), { headers: { "User-Agent": "FayteWorks" } });
    if (!response.ok) throw new Error(`The site answered ${response.status}.`);
    const size = Number(response.headers.get("content-length") || 0);
    if (size > 40 * 1024 * 1024) throw new Error("That file is over 40 MB.");
    const type = (response.headers.get("content-type") || "").split(";")[0].trim();
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 40 * 1024 * 1024) throw new Error("That file is over 40 MB.");
    const name = decodeURIComponent(address.pathname.split("/").pop() || "download");
    if (type === "text/html") return { url: response.url, type, name, html: new TextDecoder().decode(bytes) };
    return { url: response.url, type, name, bytes };
  });
  handle("update:install", async () => {
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  });
  const secretName = (service) => {
    if (!/^[a-z]{2,20}(:[\w-]{1,64})?$/.test(String(service))) throw new Error("Invalid secret name.");
    return String(service);
  };
  handle("secrets:has", async (service) => Boolean(await getToken(secretName(service))));
  handle("secrets:set", (service, token) => setToken(secretName(service), token));
  handle("deploy:netlify", async (options) => {
    const token = await getToken("netlify");
    if (!token) throw new Error("Add a Netlify access token first.");
    return deployNetlify({ ...options, token, zip: Buffer.from(options.zip) });
  });
  handle("deploy:cloudflare", async (options) => {
    const token = await getToken("cloudflare");
    if (!token) throw new Error("Add a Cloudflare API token first.");
    return deployCloudflare({ ...options, token });
  });
  handle("deploy:github", async (options) => {
    const token = await getToken("github");
    if (!token) throw new Error("Add a GitHub access token first.");
    return deployGithub({ ...options, token });
  });
}

async function checkForUpdates(window) {
  if (!app.isPackaged) return;
  const own = await readJson(path.join(here, "own-build.json"), null);
  if (own) {
    const token = await getToken("updates");
    if (!token) {
      if (!window.isDestroyed()) window.webContents.send("update:needs-key", { repo: `${own.owner}/${own.repo}` });
      return;
    }
    autoUpdater.setFeedURL({ provider: "github", owner: own.owner, repo: own.repo, private: true, token });
    autoUpdater.allowPrerelease = true;
  }
  await autoUpdater.checkForUpdates().catch((error) => console.warn("Update check failed:", error?.message ?? error));
}

function setupUpdates(window) {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", (info) => {
    if (!window.isDestroyed()) window.webContents.send("update:ready", { version: info.version });
  });
  autoUpdater.on("error", (error) => console.warn("Update check failed:", error?.message ?? error));
  window.webContents.once("did-finish-load", () => void checkForUpdates(window));
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    title: "FayteWorks",
    icon: path.join(here, "..", "build", "icon.png"),
    backgroundColor: "#121316",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  registerIpc(window);
  setupUpdates(window);
  await rememberedFolder();
  window.webContents.session.on("will-download", (_event, item) => {
    item.setSaveDialogOptions({ defaultPath: path.join(lastFolder, item.getFilename()) });
    item.once("done", (_e, state) => {
      if (state === "completed") void rememberFolder(path.dirname(item.getSavePath()));
    });
  });
  window.webContents.on("context-menu", (_event, params) => {
    if (!params.isEditable) return;
    const items = params.dictionarySuggestions.slice(0, 5).map((word) => ({ label: word, click: () => window.webContents.replaceMisspelling(word) }));
    if (params.misspelledWord) {
      if (!items.length) items.push({ label: "No suggestions", enabled: false });
      items.push({ label: "Add to dictionary", click: () => window.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) }, { type: "separator" });
    }
    items.push({ role: "cut" }, { role: "copy" }, { role: "paste" }, { type: "separator" }, { role: "selectAll" });
    Menu.buildFromTemplate(items).popup({ window });
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  if (DEV_URL) await window.loadURL(DEV_URL);
  else await window.loadFile(path.join(here, "..", "dist", "index.html"));
}

app.whenReady().then(async () => {
  protocol.handle(ASSET_SCHEME, async (request) => {
    const hash = new URL(request.url).pathname.replace(/^\//, "");
    const file = project?.assets.get(hash);
    if (!file) return new Response("Not found", { status: 404 });
    const response = await net.fetch(pathToFileURL(path.join(project.path, "assets", file)).toString(), { headers: request.headers });
    const headers = new Headers(response.headers);
    headers.set("Content-Type", MIME[path.extname(file).slice(1).toLowerCase()] ?? "application/octet-stream");
    return new Response(response.body, { status: response.status, headers });
  });
  await createWindow();
});

app.on("window-all-closed", () => app.quit());
