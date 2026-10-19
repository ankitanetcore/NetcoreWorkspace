import { useSyncExternalStore } from "react";

let folderId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function selectFolder(id: string | null) {
  if (folderId === id) {
    return;
  }
  folderId = id;
  emit();
}

export function useSelectedFolder() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => folderId,
    () => folderId,
  );
}
