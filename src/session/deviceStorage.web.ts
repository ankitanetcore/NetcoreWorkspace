export interface StoredIdentity {
  clientId: string;
  displayName: string;
}

const storageKey = "netcore.identity";

export function loadStoredIdentity(): StoredIdentity | null {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredIdentity>;
    if (typeof parsed.clientId !== "string" || typeof parsed.displayName !== "string") {
      return null;
    }
    const clientId = parsed.clientId.trim();
    const displayName = parsed.displayName.trim();
    if (!clientId || !displayName) {
      return null;
    }
    return { clientId, displayName };
  } catch {
    return null;
  }
}

export function storeIdentity(identity: StoredIdentity) {
  globalThis.localStorage.setItem(storageKey, JSON.stringify(identity));
}
