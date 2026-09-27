import { migrateSite } from "../model/migrate";
import type { Site } from "../model/types";
import { bundleAssets, restoreAssets, type AssetBundle } from "./bundle";

interface SiteFileBundle {
  format: "fayteworks";
  bundleVersion: 1;
  site: Site;
  assets: AssetBundle;
}

const isBundle = (format: unknown) => format === "fayteworks" || format === "site-builder";

export async function buildSiteFile(site: Site): Promise<string> {
  const bundle: SiteFileBundle = { format: "fayteworks", bundleVersion: 1, site, assets: await bundleAssets(site) };
  return JSON.stringify(bundle, null, 2);
}

export async function readSiteFile(text: string): Promise<Site> {
  const parsed = JSON.parse(text) as Partial<SiteFileBundle>;
  if (isBundle(parsed.format)) {
    await restoreAssets(parsed.assets);
  }
  const site = migrateSite(isBundle(parsed.format) ? parsed.site : parsed);
  if (!site) {
    throw new Error("Not a site file");
  }
  return site;
}
