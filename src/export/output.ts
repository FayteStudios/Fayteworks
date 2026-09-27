import type { OutputFile } from "./zip";

type DirectoryPicker = (options: { mode: "readwrite" }) => Promise<FileSystemDirectoryHandle>;

export function canWriteToFolder(): boolean {
  return "showDirectoryPicker" in window;
}

export async function writeToFolder(files: OutputFile[]): Promise<string> {
  const picker = (window as unknown as { showDirectoryPicker: DirectoryPicker }).showDirectoryPicker;
  const root = await picker({ mode: "readwrite" });
  for (const file of files) {
    const parts = file.path.split("/");
    const fileName = parts.pop()!;
    let dir = root;
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
    const handle = await dir.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(file.data as BlobPart);
    await writable.close();
  }
  return root.name;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
