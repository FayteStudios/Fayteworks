import { spawn } from "node:child_process";
import { existsSync, watch } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MEDIA_EXT = /\.(mp4|m4v|mov|webm|mkv|mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i;
const TYPES = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska", mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", flac: "audio/flac" };

export async function findMediaApps() {
  const apps = [];
  const add = (id, name, kind, exe, opensFiles = true) => {
    if (exe && existsSync(exe) && !apps.some((a) => a.path === exe)) apps.push({ id, name, kind, path: exe, opensFiles });
  };
  if (process.platform === "win32") {
    const roots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], path.join(os.homedir(), "AppData", "Local", "Programs")].filter(Boolean);
    for (const root of roots) {
      add("resolve", "DaVinci Resolve", "video", path.join(root, "Blackmagic Design", "DaVinci Resolve", "Resolve.exe"), false);
      add("shotcut", "Shotcut", "video", path.join(root, "Shotcut", "shotcut.exe"));
      add("kdenlive", "Kdenlive", "video", path.join(root, "kdenlive", "bin", "kdenlive.exe"));
      add("openshot", "OpenShot", "video", path.join(root, "OpenShot Video Editor", "openshot-qt.exe"));
      add("audacity", "Audacity", "audio", path.join(root, "Audacity", "Audacity.exe"));
      add("reaper", "REAPER", "audio", path.join(root, "REAPER (x64)", "reaper.exe"));
      const adobe = path.join(root, "Adobe");
      if (existsSync(adobe)) {
        for (const dir of (await fs.readdir(adobe)).sort().reverse()) {
          if (/^Adobe Premiere Pro/i.test(dir)) add("premiere", dir.replace(/^Adobe /, ""), "video", path.join(adobe, dir, "Adobe Premiere Pro.exe"), false);
          if (/^Adobe Audition/i.test(dir)) add("audition", dir.replace(/^Adobe /, ""), "audio", path.join(adobe, dir, "Adobe Audition.exe"));
        }
      }
    }
  } else if (process.platform === "darwin") {
    add("resolve", "DaVinci Resolve", "video", "/Applications/DaVinci Resolve/DaVinci Resolve.app", false);
    add("shotcut", "Shotcut", "video", "/Applications/Shotcut.app");
    add("kdenlive", "Kdenlive", "video", "/Applications/kdenlive.app");
    add("audacity", "Audacity", "audio", "/Applications/Audacity.app");
    if (existsSync("/Applications")) {
      for (const dir of (await fs.readdir("/Applications")).filter((d) => /^Adobe Premiere Pro/i.test(d))) add("premiere", dir.replace(/^Adobe /, ""), "video", path.join("/Applications", dir, `${dir}.app`), false);
    }
  } else {
    add("kdenlive", "Kdenlive", "video", "/usr/bin/kdenlive");
    add("shotcut", "Shotcut", "video", "/usr/bin/shotcut");
    add("audacity", "Audacity", "audio", "/usr/bin/audacity");
  }
  return apps;
}

function launch(appPath, file) {
  if (!existsSync(appPath)) throw new Error(`Can't find ${appPath}.`);
  const args = file ? [file] : [];
  const child = process.platform === "darwin" && appPath.endsWith(".app") ? spawn("open", ["-a", appPath, ...args], { detached: true, stdio: "ignore" }) : spawn(appPath, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

export function createMediaEditor({ send, shell }) {
  const watchers = new Map();

  function stop(blockId) {
    const w = watchers.get(blockId);
    if (!w) return;
    w.watcher.close();
    for (const t of w.timers.values()) clearInterval(t);
    watchers.delete(blockId);
  }

  function stopAll() {
    for (const id of [...watchers.keys()]) stop(id);
  }

  function settle(blockId, file, w) {
    if (w.timers.has(file)) return;
    let last = -1;
    let still = 0;
    const timer = setInterval(async () => {
      try {
        const { size, mtimeMs } = await fs.stat(file);
        if (size > 0 && size === last) still++;
        else still = 0;
        last = size;
        if (still >= 2) {
          clearInterval(timer);
          w.timers.delete(file);
          const key = `${size}:${mtimeMs}`;
          if (w.seen.get(file) === key) return;
          w.seen.set(file, key);
          const data = await fs.readFile(file);
          const ext = path.extname(file).slice(1).toLowerCase();
          send("media:changed", { blockId, name: path.basename(file), type: TYPES[ext] ?? "application/octet-stream", data: new Uint8Array(data) });
        }
      } catch {
      }
    }, 1000);
    w.timers.set(file, timer);
  }

  return {
    async edit(projectPath, blockId, name, bytes, appPath) {
      if (!SAFE_ID.test(blockId)) throw new Error("Invalid media id.");
      const folder = path.join(projectPath, "media", blockId);
      const exportDir = path.join(folder, "export here");
      await fs.mkdir(exportDir, { recursive: true });
      const safeName = name.replace(/[^\w.-]+/g, "_") || "clip";
      const original = path.join(folder, safeName);
      await fs.writeFile(original, Buffer.from(bytes));
      stop(blockId);
      const w = { watcher: null, timers: new Map(), seen: new Map() };
      for (const f of await fs.readdir(exportDir)) {
        const st = await fs.stat(path.join(exportDir, f)).catch(() => null);
        if (st) w.seen.set(path.join(exportDir, f), `${st.size}:${st.mtimeMs}`);
      }
      w.watcher = watch(exportDir, (_event, file) => {
        if (file && MEDIA_EXT.test(String(file))) settle(blockId, path.join(exportDir, String(file)), w);
      });
      watchers.set(blockId, w);
      if (appPath) launch(appPath, original);
      else await shell.openPath(original);
      await shell.openPath(exportDir);
      return { folder, exportDir, original };
    },
    stop,
    stopAll
  };
}
