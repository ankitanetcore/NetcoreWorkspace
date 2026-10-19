import { createWebSocketTransport } from "@/transport/webSocketTransport";
import type { Transport, TransportEnvelope, TransportSnapshots } from "@/transport/types";

let transport: Transport | null = null;

function emptySnapshots(): TransportSnapshots {
  return {
    rooms: { rooms: [] },
    direct: { threads: [] },
    files: { folders: [] },
    call: { participants: [] },
    presence: { peers: [] },
  };
}

export function getTransport(): Transport {
  if (!transport) {
    transport = createWebSocketTransport(emptySnapshots());
  }
  return transport;
}

export type { Transport, TransportEnvelope };
