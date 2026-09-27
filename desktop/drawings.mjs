import { spawn } from "node:child_process";
import { existsSync, watch } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function findVectorApps() {
  const apps = [];
  const add = (id, name, exe) => {
    if (exe && existsSync(exe) && !apps.some((a) => a.path === exe)) apps.push({ id, name, path: exe });
  };
  if (process.platform === "win32") {
    const programFiles = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], path.join(os.homedir(), "AppData", "Local", "Programs")].filter(Boolean);
    for (const root of programFiles) {
      add("inkscape", "Inkscape", path.join(root, "Inkscape", "bin", "inkscape.exe"));
      add("affinity", "Affinity Designer 2", path.join(root, "Affinity", "Designer 2", "Designer.exe"));
      add("affinity", "Affinity", path.join(root, "Affinity", "Affinity", "Affinity.exe"));
      if (existsSync(root)) {
        for (const dir of (await fs.readdir(root)).filter((d) => /^Scribus/i.test(d)).sort().reverse()) add("scribus", dir, path.join(root, dir, "Scribus.exe"));
      }
      const adobe = path.join(root, "Adobe");
      if (existsSync(adobe)) {
        for (const dir of (await fs.readdir(adobe)).filter((d) => /^Adobe Illustrator/i.test(d)).sort().reverse()) {
          add("illustrator", dir.replace(/^Adobe /, ""), path.join(adobe, dir, "Support Files", "Contents", "Windows", "Illustrator.exe"));
        }
      }
    }
  } else if (process.platform === "darwin") {
    add("inkscape", "Inkscape", "/Applications/Inkscape.app");
    add("affinity", "Affinity Designer 2", "/Applications/Affinity Designer 2.app");
    add("scribus", "Scribus", "/Applications/Scribus.app");
    if (existsSync("/Applications")) {
      for (const dir of (await fs.readdir("/Applications")).filter((d) => /^Adobe Illustrator/i.test(d)).sort().reverse()) {
        const bundle = path.join("/Applications", dir, `${dir}.app`);
        add("illustrator", dir.replace(/^Adobe /, ""), existsSync(bundle) ? bundle : path.join("/Applications", dir));
      }
    }
  } else {
    for (const exe of ["/usr/bin/inkscape", "/usr/local/bin/inkscape", "/snap/bin/inkscape"]) add("inkscape", "Inkscape", exe);
    for (const exe of ["/usr/bin/scribus", "/usr/local/bin/scribus"]) add("scribus", "Scribus", exe);
  }
  return apps;
}

function launch(appPath, file, shell) {
  if (!appPath) return shell.openPath(file).then((error) => {
    if (error) throw new Error(error);
  });
  if (!existsSync(appPath)) throw new Error(`Can't find ${appPath}.`);
  const child =
    process.platform === "darwin" && appPath.endsWith(".app")
      ? spawn("open", ["-a", appPath, file], { detached: true, stdio: "ignore" })
      : spawn(appPath, [file], { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

export function createDrawingEditor({ send, shell }) {
  let folder = null;
  let watcher = null;
  const editing = new Map();
  const timers = new Map();

  function stopAll() {
    watcher?.close();
    watcher = null;
    folder = null;
    editing.clear();
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  }

  function ensureWatcher(dir) {
    if (folder === dir && watcher) return;
    stopAll();
    folder = dir;
    watcher = watch(dir, (_event, name) => {
      if (!name || !editing.has(String(name))) return;
      clearTimeout(timers.get(name));
      timers.set(
        name,
        setTimeout(async () => {
          timers.delete(name);
          const entry = editing.get(String(name));
          if (!entry) return;
          try {
            const svg = await fs.readFile(path.join(dir, String(name)), "utf8");
            if (!svg.trim() || svg === entry.last) return;
            entry.last = svg;
            send("vector:changed", { blockId: entry.blockId, svg });
          } catch {
          }
        }, 300)
      );
    });
    watcher.on("error", () => stopAll());
  }

  return {
    async edit(projectPath, blockId, svg, appPath) {
      if (!SAFE_ID.test(blockId)) throw new Error("Invalid drawing id.");
      const dir = path.join(projectPath, "drawings");
      await fs.mkdir(dir, { recursive: true });
      const name = `${blockId}.svg`;
      const file = path.join(dir, name);
      const current = existsSync(file) ? await fs.readFile(file, "utf8") : null;
      if (current !== svg) await fs.writeFile(file, svg, "utf8");
      ensureWatcher(dir);
      editing.set(name, { blockId, last: svg });
      await launch(appPath, file, shell);
      return file;
    },
    stop(blockId) {
      editing.delete(`${blockId}.svg`);
      if (!editing.size) stopAll();
    },
    stopAll
  };
}
