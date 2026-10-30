import { useSyncExternalStore } from "react";

const storageKey = "netcore.expandedFolders";
let expanded = readExpanded();
const listeners = new Set<() => void>();

function readExpanded() {
  if (typeof localStorage === "undefined") {
    return new Set<string>();
  }
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set<string>(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function emit() {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(storageKey, JSON.stringify([...expanded]));
  }
  for (const listener of listeners) {
    listener();
  }
}

export function toggleFolderExpanded(id: string) {
  const next = new Set(expanded);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  expanded = next;
  emit();
}

export function expandFolders(ids: string[]) {
  if (ids.length === 0 || ids.every((id) => expanded.has(id))) {
    return;
  }
  const next = new Set(expanded);
  for (const id of ids) {
    next.add(id);
  }
  expanded = next;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useExpandedFolders() {
  return useSyncExternalStore(
    subscribe,
    () => expanded,
    () => expanded,
  );
}
