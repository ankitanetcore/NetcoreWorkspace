import { createMockTransport } from "@/transport/mockTransport";
import { seed } from "@/transport/seed";
import type { Transport, TransportEnvelope, TransportSnapshots } from "@/transport/types";

let transport: Transport | null = null;

function copySeed(): TransportSnapshots {
  return JSON.parse(JSON.stringify(seed)) as TransportSnapshots;
}

export function getTransport(): Transport {
  if (!transport) {
    transport = createMockTransport(copySeed());
  }
  return transport;
}

export type { Transport, TransportEnvelope };
