import { cleanLine, cleanPhoto } from "@/session/profile";

export interface StoredIdentity {
  clientId: string;
  displayName: string;
  title?: string;
  location?: string;
  photoUri?: string;
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
    return {
      clientId,
      displayName,
      title: cleanLine(typeof parsed.title === "string" ? parsed.title : ""),
      location: cleanLine(typeof parsed.location === "string" ? parsed.location : ""),
      photoUri: cleanPhoto(typeof parsed.photoUri === "string" ? parsed.photoUri : ""),
    };
  } catch {
    return null;
  }
}

export function storeIdentity(identity: StoredIdentity) {
  const saved = {
    clientId: identity.clientId,
    displayName: identity.displayName,
    title: cleanLine(identity.title),
    location: cleanLine(identity.location),
    photoUri: cleanPhoto(identity.photoUri),
  };
  try {
    globalThis.localStorage.setItem(storageKey, JSON.stringify(saved));
  } catch {
    globalThis.localStorage.setItem(storageKey, JSON.stringify({ ...saved, photoUri: "" }));
  }
}
