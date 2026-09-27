export function tailwindKey(preset: string, html: string): string {
  let h = 5381;
  for (let i = 0; i < html.length; i++) h = ((h << 5) + h + html.charCodeAt(i)) | 0;
  return `${preset}:${html.length}:${(h >>> 0).toString(36)}`;
}
