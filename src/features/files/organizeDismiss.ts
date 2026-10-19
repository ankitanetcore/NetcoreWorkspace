const key = "netcore.organize-dismissed";
const memory = new Set<string>();
const listeners = new Set<() => void>();
let loaded = false;

function load() {
  if (loaded) {
    return;
  }
  loaded = true;
  try {
    const raw = localStorage.getItem(key);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(ids)) {
      for (const id of ids) {
        if (typeof id === "string" && id) {
          memory.add(id);
        }
      }
    }
  } catch {
    loaded = true;
  }
}

function save() {
  try {
    localStorage.setItem(key, JSON.stringify([...memory]));
  } catch {
    // The prompt still stays dismissed for this session.
  }
}

export function isOrganizeDismissed(fileId: string) {
  load();
  return memory.has(fileId);
}

export function dismissOrganize(fileId: string) {
  load();
  memory.add(fileId);
  save();
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeOrganizeDismiss(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
