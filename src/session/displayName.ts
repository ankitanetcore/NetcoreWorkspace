import type { PresencePeer } from "@/domain/types";
import { systemClientId, systemDisplayName } from "@/session/systemIdentity";

export function displayNameFor(
  peers: Pick<PresencePeer, "clientId" | "displayName">[],
  id: string | undefined,
  fallback: string,
  self?: { clientId: string; name: string },
) {
  if (id === systemClientId) {
    return systemDisplayName;
  }
  if (id && self && id === self.clientId && self.name.trim()) {
    return self.name.trim();
  }
  const live = id ? peers.find((peer) => peer.clientId === id)?.displayName.trim() : "";
  return live || fallback;
}
