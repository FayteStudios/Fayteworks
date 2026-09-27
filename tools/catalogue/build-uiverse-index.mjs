import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repo = process.argv[2];
if (!repo || !fs.existsSync(path.join(repo, "LICENSE"))) {
  console.error("Usage: node tools/catalogue/build-uiverse-index.mjs <path to a clone of uiverse-io/galaxy>");
  process.exit(1);
}
const licence = fs.readFileSync(path.join(repo, "LICENSE"), "utf8");
if (!/^MIT License/.test(licence)) throw new Error("The galaxy repository's licence is no longer MIT: check before indexing.");
const commit = execSync("git rev-parse HEAD", { cwd: repo }).toString().trim();

const CATEGORY_NAMES = {
  Buttons: "Buttons",
  Cards: "Cards",
  Checkboxes: "Checkboxes",
  Forms: "Forms",
  Inputs: "Inputs",
  loaders: "Loaders",
  Notifications: "Notifications",
  Patterns: "Patterns",
  "Radio-buttons": "Radio buttons",
  "Toggle-switches": "Toggles",
  Tooltips: "Tooltips"
};
const SINGULAR = { Buttons: "button", Cards: "card", Checkboxes: "checkbox", Forms: "form", Inputs: "input", Loaders: "loader", Notifications: "notification", Patterns: "pattern", "Radio buttons": "radio button", Toggles: "toggle", Tooltips: "tooltip" };
const NOISE = new Set(["css", "simple", "html", "tailwind", "tailwindcss", "tailwind -->", "tailwindcss -->", "uiverse", "cool", "beautiful", "nice", "button", "buttons", "card", "cards", "loader", "loaders", "input", "inputs", "form", "forms", "checkbox", "checkboxes", "radio", "switch", "toggle", "tooltip", "notification", "pattern", "loading"]);
const DARK = /\b(dark|black|neon|night|cyberpunk)\b/;

const categories = Object.values(CATEGORY_NAMES);
const authors = [];
const authorIndex = new Map();
const items = [];
let skipped = 0;

for (const [dir, category] of Object.entries(CATEGORY_NAMES)) {
  const folder = path.join(repo, dir);
  if (!fs.existsSync(folder)) continue;
  for (const file of fs.readdirSync(folder).sort()) {
    if (!file.endsWith(".html")) continue;
    const text = fs.readFileSync(path.join(folder, file), "utf8");
    if (!/<style/i.test(text) || /<script/i.test(text)) {
      skipped++;
      continue;
    }
    const uploader = text.match(/From Uiverse\.io by\s+(\S+)/i)?.[1] ?? file.split("_")[0];
    const original = text.match(/From Uiverse\.io by[^\n]*?- Name:\s*([^\n*]+?)\s+- Tags:/i)?.[1];
    const author = original && original !== uploader ? `${uploader}, after ${original}` : uploader;
    const rawTags = (text.match(/From Uiverse\.io by[^\n]*?- Tags:\s*([^*\n]*)/i)?.[1] ?? "").replace(/-->.*/, "");
    const tags = [...new Set(rawTags.split(",").map((t) => t.replace(/#/g, "").trim().toLowerCase()).filter((t) => t && !NOISE.has(t) && t.length < 28))].slice(0, 8);
    if (!authorIndex.has(author)) {
      authorIndex.set(author, authors.length);
      authors.push(author);
    }
    const singular = SINGULAR[category];
    const kind = new RegExp(`\\b${singular}s?\\b`, "g");
    const descriptive = tags.filter((t) => !/effect|animation|animated|hover|design|style/.test(t)).map((t) => t.replace(kind, "").replace(/\s+/g, " ").trim());
    const words = [...new Set(descriptive.filter(Boolean))].slice(0, 2);
    const name = words.length ? `${words.join(" ")} ${singular}` : `${singular} by ${uploader}`;
    items.push([
      categories.indexOf(category),
      `${dir}/${file}`,
      authorIndex.get(author),
      tags.join(","),
      name.charAt(0).toUpperCase() + name.slice(1),
      DARK.test(tags.join(" ")) ? 1 : 0
    ]);
  }
}

const out = {
  source: { name: "Uiverse", repository: "uiverse-io/galaxy", commit, licence: "MIT", copyright: "Copyright (c) 2023 Uiverse.io" },
  categories,
  authors,
  items
};
const target = path.resolve("src/catalogue/uiverse-index.json");
fs.writeFileSync(target, JSON.stringify(out));
console.log(`Indexed ${items.length} components by ${authors.length} authors (skipped ${skipped} Tailwind/script ones) at ${commit.slice(0, 7)} → ${target} (${Math.round(fs.statSync(target).size / 1024)} KB)`);
