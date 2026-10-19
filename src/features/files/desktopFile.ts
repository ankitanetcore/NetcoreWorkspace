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

export function filesFromDrop(event: DragEvent) {
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
    if (entry?.isDirectory) {
      continue;
    }
    const file = item.getAsFile();
    if (file) {
      files.push(file);
    }
  }
  return files;
}
