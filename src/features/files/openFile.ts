import { useSyncExternalStore } from "react";

export interface RequestedFile {
  folderId: string;
  fileId: string;
}

let requested: RequestedFile | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function requestOpenFile(folderId: string, fileId: string) {
  requested = { folderId, fileId };
  emit();
}

export function clearRequestedFile() {
  if (!requested) {
    return;
  }
  requested = null;
  emit();
}

export function useRequestedFile() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => requested,
    () => requested,
  );
}
