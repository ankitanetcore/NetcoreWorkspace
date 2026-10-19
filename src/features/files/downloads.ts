const urls = new Map<string, string>();

export function setFileDownload(id: string, url: string) {
  const previous = urls.get(id);
  if (
    previous &&
    previous !== url &&
    previous.startsWith("blob:") &&
    typeof URL !== "undefined" &&
    typeof URL.revokeObjectURL === "function"
  ) {
    URL.revokeObjectURL(previous);
  }
  urls.set(id, url);
}

export function fileDownloadUrl(id: string) {
  return urls.get(id) ?? null;
}

export function forgetFileDownload(id: string) {
  const previous = urls.get(id);
  if (
    previous &&
    previous.startsWith("blob:") &&
    typeof URL !== "undefined" &&
    typeof URL.revokeObjectURL === "function"
  ) {
    URL.revokeObjectURL(previous);
  }
  urls.delete(id);
}
