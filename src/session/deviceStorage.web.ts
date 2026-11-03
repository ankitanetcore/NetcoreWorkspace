import { createClientId } from "@/session/createClientId";
import { cleanLine, cleanPhoto } from "@/session/profile";

export interface StoredIdentity {
  clientId: string;
  displayName: string;
  title?: string;
  location?: string;
  photoUri?: string;
}

const storageKey = "netcore.identity";
const deviceKey = "netcore.device";

export interface DeviceCredential {
  clientId: string;
  secret: string;
}

function randomSecret() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function loadDeviceCredential(): DeviceCredential {
  const identity = loadStoredIdentity();
  try {
    const raw = globalThis.localStorage?.getItem(deviceKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DeviceCredential>;
      const secret = typeof parsed.secret === "string" ? parsed.secret : "";
      const clientId = identity?.clientId || (typeof parsed.clientId === "string" ? parsed.clientId.trim() : "");
      if (clientId && /^[a-f0-9]{64}$/.test(secret)) {
        const credential = { clientId, secret };
        globalThis.localStorage.setItem(deviceKey, JSON.stringify(credential));
        return credential;
      }
    }
  } catch {
    // Generate a credential below.
  }
  const credential = {
    clientId: identity?.clientId || createClientId(),
    secret: randomSecret(),
  };
  try {
    globalThis.localStorage.setItem(deviceKey, JSON.stringify(credential));
  } catch {
    // The page can still register this secret for the current load.
  }
  return credential;
}

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
