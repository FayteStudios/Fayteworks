import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [hyperuiDir, merakiDir, flowbiteDir] = process.argv.slice(2);
if (![hyperuiDir, merakiDir, flowbiteDir].every((d) => d && fs.existsSync(d))) {
  console.error("Usage: node tools/catalogue/build-tailwind-index.mjs <hyperui> <merakiui> <flowbite>");
  process.exit(1);
}

function source(dir, id, name, repository, preset) {
  const licenceFile = fs.readdirSync(dir).find((f) => /^LICENSE/i.test(f));
  const licence = fs.readFileSync(path.join(dir, licenceFile), "utf8");
  if (!/^MIT License/.test(licence)) throw new Error(`${name}'s licence is no longer MIT: check before indexing.`);
  const copyright = licence.match(/^Copyright .*$/m)[0].trim();
  const commit = execSync("git rev-parse HEAD", { cwd: dir }).toString().trim();
  return { id, name, repository, commit, licence: "MIT", copyright, kind: "tailwind", preset };
}

const sources = [
  source(hyperuiDir, "hyperui", "HyperUI", "markmead/hyperui", "on"),
  source(merakiDir, "meraki", "Meraki UI", "merakiuilabs/merakiui", "on"),
  source(flowbiteDir, "flowbite", "Flowbite", "themesberg/flowbite", "flowbite")
];

const KINDS = [
  ["Buttons", /button/],
  ["Badges", /badge|kbd|indicator/],
  ["Notifications", /alert|toast|announcement|banner|notification/],
  ["Loaders", /loader|spinner|progress|skeleton/],
  ["Cards", /card|list-group|media/],
  ["Forms", /form|sign-in|registration|newsletter|file-upload|contact/],
  ["Inputs", /input|select|textarea|range|search|datepicker|number/],
  ["Checkboxes", /checkbox/],
  ["Radio buttons", /radio/],
  ["Toggles", /toggle/],
  ["Tooltips", /tooltip|popover/],
  ["Navigation", /header|navbar|nav|breadcrumb|pagination|menu|tabs|step|sidebar|dropdown|bottom-navigation|skip-link/],
  ["Heroes", /hero|jumbotron/],
  ["Features", /feature|logo-cloud/],
  ["Pricing", /pricing/],
  ["Testimonials", /testimonial|rating/],
  ["Team", /team|avatar/],
  ["FAQ", /faq|accordion/],
  ["Calls to action", /cta/],
  ["Stats", /stat/],
  ["Blog", /blog|article/],
  ["Shop", /cart|product|shop/],
  ["Tables", /table|details-list|timeline/],
  ["Footers", /footer/],
  ["Modals", /modal|drawer/],
  ["Sections", /./]
];
const kindOf = (slug) => KINDS.find(([, re]) => re.test(slug))[0];
const categories = KINDS.map(([name]) => name);

const titleCase = (s) => s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const needsScript = (html) => /<script(?![^>]*cdn\.tailwindcss)|x-data|x-show|@click|x-on:|:class=|onclick=/i.test(html);
const items = [];
let skipped = 0;
const add = (src, kind, file, name, flags = 0, author = "") => items.push([sources.findIndex((s) => s.id === src), categories.indexOf(kind), file, name, flags, author]);

for (const collection of ["marketing", "application", "neobrutalism"]) {
  const root = path.join(hyperuiDir, "public/examples", collection);
  for (const slug of fs.readdirSync(root).sort()) {
    const mdxPath = path.join(hyperuiDir, "src/content/collection", collection, `${slug}.mdx`);
    const mdx = fs.existsSync(mdxPath) ? fs.readFileSync(mdxPath, "utf8") : "";
    const title = mdx.match(/^title:\s*(.+)$/m)?.[1].replace(/^['"]|['"]$/g, "") ?? titleCase(slug);
    const entries = [...mdx.matchAll(/^\s*- \{(.*)\}\s*$/gm)].map((m) => {
      const own = m[1].replace(/dark:\s*\{[^}]*\}/, "");
      return {
        title: own.match(/title:\s*'((?:[^'\\]|\\.)*)'|title:\s*"([^"]*)"/)?.slice(1).find(Boolean) ?? "",
        contributors: (own.match(/contributors:\s*\[([^\]]*)\]/)?.[1] ?? "").split(",").map((c) => c.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean)
      };
    });
    const files = fs.readdirSync(path.join(root, slug)).filter((f) => /^\d+\.html$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
    for (const file of files) {
      const html = fs.readFileSync(path.join(root, slug, file), "utf8");
      if (needsScript(html.replace(/<script src="\/component\.js"[^>]*><\/script>/, ""))) {
        skipped++;
        continue;
      }
      const n = parseInt(file);
      const entry = entries[n - 1];
      const hasDark = fs.existsSync(path.join(root, slug, `${n}-dark.html`)) ? 1 : 0;
      const prefix = collection === "neobrutalism" ? `Neobrutalist ${title.toLowerCase()}` : title;
      add("hyperui", kindOf(slug), `public/examples/${collection}/${slug}/${file}`, `${prefix}: ${entry?.title || `#${n}`}`, hasDark, ["Mark Mead", ...(entry?.contributors ?? [])].filter((c, i, a) => a.indexOf(c) === i).join(", "));
    }
  }
}

for (const kind of fs.readdirSync(path.join(merakiDir, "components")).sort()) {
  if (kind === "email-templates") continue;
  for (const file of fs.readdirSync(path.join(merakiDir, "components", kind)).sort()) {
    if (!file.endsWith(".html")) continue;
    const html = fs.readFileSync(path.join(merakiDir, "components", kind, file), "utf8");
    if (needsScript(html)) {
      skipped++;
      continue;
    }
    const name = file.replace(/\.html$/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
    const hasDark = /\bdark:/.test(html) ? 1 : 0;
    add("meraki", kindOf(kind), `components/${kind}/${file}`, `${titleCase(kind)}: ${name}`, hasDark, "Khatab Wedaa");
  }
}

const FLOWBITE_JS = /data-(modal|dropdown|collapse|carousel|tooltip|popover|accordion|drawer|dismiss|tabs|dial|datepicker|copy|input-counter|toggle)|\{\{|<script/i;
for (const dir of ["components", "forms"]) {
  for (const file of fs.readdirSync(path.join(flowbiteDir, "content", dir)).sort()) {
    if (!file.endsWith(".md")) continue;
    const md = fs.readFileSync(path.join(flowbiteDir, "content", dir, file), "utf8");
    const pageTitle = (md.match(/^title:\s*(.+)$/m)?.[1] ?? titleCase(file.replace(".md", ""))).replace(/^Tailwind CSS\s+/i, "").replace(/\s+-\s+Flowbite$/i, "");
    let index = 0;
    let heading = "";
    const lines = md.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("## ")) heading = lines[i].slice(3).trim();
      if (!/^\{\{<\s*example\b/.test(lines[i])) continue;
      const end = lines.findIndex((l, j) => j > i && /^\{\{<\s*\/example\s*>\}\}/.test(l));
      const body = lines.slice(i + 1, end).join("\n");
      const n = index++;
      i = end;
      if (FLOWBITE_JS.test(body) || !body.trim()) {
        skipped++;
        continue;
      }
      add("flowbite", kindOf(`${file} ${heading}`.toLowerCase()), `content/${dir}/${file}#${n}`, `${pageTitle}: ${heading || `example ${n + 1}`}`, 0, "Flowbite");
    }
  }
}

const out = {
  sources,
  categories,
  items
};
const target = path.resolve("src/catalogue/tailwind-index.json");
fs.writeFileSync(target, JSON.stringify(out));
const per = sources.map((s, i) => `${s.name} ${items.filter((it) => it[0] === i).length}`).join(", ");
console.log(`Indexed ${items.length} Tailwind components (${per}; skipped ${skipped} needing JavaScript) → ${target} (${Math.round(fs.statSync(target).size / 1024)} KB)`);
