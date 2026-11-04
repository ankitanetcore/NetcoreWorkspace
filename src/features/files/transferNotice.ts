const listeners = new Set<(notice: string) => void>();
let notice = "";

export function transferNotice() {
  return notice;
}

export function reportTransferProgress(name: string, loaded: number, total: number) {
  const label = name.trim() || "file";
  const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  notice = `Sending ${label}… ${percent}%`;
  for (const listener of listeners) {
    listener(notice);
  }
}

export function reportTransferFailure(name: string, detail?: string) {
  const label = name.trim();
  notice = detail || (label ? `${label} didn't send. Try again.` : "A file transfer failed. Try again.");
  console.log("File transfer failed", label || "file");
  for (const listener of listeners) {
    listener(notice);
  }
}

export function clearTransferNotice() {
  if (!notice) {
    return;
  }
  notice = "";
  for (const listener of listeners) {
    listener(notice);
  }
}

export function subscribeTransferNotice(listener: (notice: string) => void) {
  listeners.add(listener);
  listener(notice);
  return () => {
    listeners.delete(listener);
  };
}
