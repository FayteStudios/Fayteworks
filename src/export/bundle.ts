import { base64ToBlob, blobToBase64, collectMediaRefs, getAsset, isAssetRef, putAsset } from "../state/assets";

export type AssetBundle = Record<string, { type: string; data: string }>;

export async function bundleAssets(value: unknown): Promise<AssetBundle> {
  const bundle: AssetBundle = {};
  for (const ref of collectMediaRefs(value)) {
    if (!isAssetRef(ref)) continue;
    const asset = await getAsset(ref);
    if (asset) bundle[ref] = { type: asset.type, data: await blobToBase64(asset.blob) };
  }
  return bundle;
}

export async function restoreAssets(bundle: AssetBundle | undefined): Promise<void> {
  for (const { type, data } of Object.values(bundle ?? {})) {
    await putAsset(base64ToBlob(data, type));
  }
}
