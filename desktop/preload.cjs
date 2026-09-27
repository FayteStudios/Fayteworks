const { contextBridge, ipcRenderer } = require("electron");

async function call(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

contextBridge.exposeInMainWorld("desktop", {
  platform: "desktop",
  recentProjects: () => call("projects:recent"),
  forgetProject: (projectPath) => call("projects:forget", projectPath),
  openProject: (projectPath) => call("projects:open", projectPath),
  createProject: (parentDir, name, siteJson) => call("projects:create", parentDir, name, siteJson),
  closeProject: () => call("projects:close"),
  chooseFolder: (title) => call("dialog:folder", title),
  saveSite: (siteJson) => call("project:saveSite", siteJson),
  putAsset: (hash, ext, bytes) => call("project:putAsset", hash, ext, bytes),
  hasAsset: (hash) => call("project:hasAsset", hash),
  projectConfig: () => call("project:config"),
  saveProjectConfig: (config) => call("project:saveConfig", config),
  exportSite: (files, chooseFolder) => call("project:export", files, chooseFolder),
  showFolder: (target) => call("shell:showFolder", target),
  openExternal: (url) => call("shell:openExternal", url),
  hasToken: (service) => call("secrets:has", service),
  setToken: (service, token) => call("secrets:set", service, token),
  deployNetlify: (options) => call("deploy:netlify", options),
  deployGithub: (options) => call("deploy:github", options),
  deployCloudflare: (options) => call("deploy:cloudflare", options),
  printDesignPdf: (html, fileName) => call("design:pdf", html, fileName),
  captureFromWebsite: (url, options) => call("capture:open", url, options),
  platformCall: (name, ...args) => call(`platform:${name}`, ...args),
  fetchData: (collectionId, source) => call("data:fetch", collectionId, source),
  openDataFile: () => call("data:openFile"),
  readDataFile: (filePath) => call("data:readFile", filePath),
  dataFileModified: (filePath) => call("data:fileModified", filePath),
  writeDataFile: (filePath, text) => call("data:writeFile", filePath, text),
  saveDataFileAs: (name, text) => call("data:saveAs", name, text),
  checkLinks: (urls) => call("links:check", urls),
  listVersions: () => call("versions:list"),
  saveVersion: (meta, siteJson) => call("versions:save", meta, siteJson),
  readVersion: (id) => call("versions:read", id),
  deleteVersion: (id) => call("versions:delete", id),
  openHtml: (html) => call("shell:openHtml", html),
  mediaApps: () => call("media:apps"),
  editMedia: (blockId, name, bytes, appPath) => call("media:edit", blockId, name, bytes, appPath),
  stopEditingMedia: (blockId) => call("media:stop", blockId),
  onMediaChanged: (callback) => {
    const listener = (_event, change) => callback(change);
    ipcRenderer.on("media:changed", listener);
    return () => ipcRenderer.removeListener("media:changed", listener);
  },
  vectorApps: () => call("vector:apps"),
  chooseVectorApp: () => call("vector:chooseApp"),
  editDrawing: (blockId, svg, appPath) => call("vector:edit", blockId, svg, appPath),
  stopEditingDrawing: (blockId) => call("vector:stop", blockId),
  onDrawingChanged: (callback) => {
    const listener = (_event, change) => callback(change);
    ipcRenderer.on("vector:changed", listener);
    return () => ipcRenderer.removeListener("vector:changed", listener);
  },
  appVersion: () => call("app:version"),
  installUpdate: () => call("update:install"),
  checkUpdates: () => call("update:check"),
  onUpdateNeedsKey: (callback) => {
    const listener = (_event, info) => callback(info);
    ipcRenderer.on("update:needs-key", listener);
    return () => ipcRenderer.removeListener("update:needs-key", listener);
  },
  onUpdateReady: (callback) => {
    const listener = (_event, info) => callback(info);
    ipcRenderer.on("update:ready", listener);
    return () => ipcRenderer.removeListener("update:ready", listener);
  }
});
