import type { DocumentPickerAsset } from "expo-document-picker";

export function assetFromFile(file: File): DocumentPickerAsset {
  return {
    name: file.name || "Untitled",
    size: file.size,
    uri: "",
    mimeType: file.type || undefined,
    lastModified: file.lastModified,
    file,
  };
}

function readEntries(reader: FileSystemDirectoryReader) {
  return new Promise<FileSystemEntry[]>((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const next = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
          return;
        }
        all.push(...batch);
        next();
      }, reject);
    };
    next();
  });
}

function withRelativePath(file: File, relative: string) {
  if (file.webkitRelativePath === relative) {
    return file;
  }
  try {
    Object.defineProperty(file, "webkitRelativePath", { configurable: true, value: relative });
  } catch {
    return file;
  }
  return file;
}

async function collectEntry(entry: FileSystemEntry, prefix: string, files: File[]) {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    const relative = prefix ? `${prefix}/${file.name}` : file.name;
    files.push(withRelativePath(file, relative));
    return;
  }
  if (!entry.isDirectory) {
    return;
  }
  const children = await readEntries((entry as FileSystemDirectoryEntry).createReader());
  const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
  for (const child of children) {
    await collectEntry(child, nextPrefix, files);
  }
}

export async function filesFromDrop(event: DragEvent) {
  const items = event.dataTransfer?.items;
  if (!items) {
    return [];
  }
  const files: File[] = [];
  for (const item of Array.from(items)) {
    if (item.kind !== "file") {
      continue;
    }
    const entry = item.webkitGetAsEntry?.();
    if (entry) {
      try {
        await collectEntry(entry, "", files);
        continue;
      } catch {
        // Fall through to the plain file when a directory entry cannot be read.
      }
    }
    const file = item.getAsFile();
    if (file) {
      files.push(file);
    }
  }
  return files;
}
