import { loadStoredIdentity } from "@/session/deviceStorage";

let current: { clientId: string; displayName: string } | null = null;

export function rememberIdentity(identity: { clientId: string; displayName: string }) {
  current = identity;
}

export function currentClientId() {
  return current?.clientId || loadStoredIdentity()?.clientId || "";
}
