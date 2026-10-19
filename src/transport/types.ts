import type { CallSnapshot, DirectSnapshot, FilesSnapshot, PresenceSnapshot, RoomsSnapshot } from "@/domain/types";

export interface TransportSnapshots {
  rooms: RoomsSnapshot;
  direct: DirectSnapshot;
  files: FilesSnapshot;
  call: CallSnapshot;
  presence: PresenceSnapshot;
}

export type TransportTopic = keyof TransportSnapshots;

export interface TransportEnvelope {
  id: string;
  topic: TransportTopic;
  type: string;
  sentAt: string;
  clientId?: string;
  payload: unknown;
}

export type TransportListener = (envelope: TransportEnvelope) => void;

/**
 * Screens talk to this seam.
 * Native builds use the in-memory mock. Web uses the WebSocket transport.
 */
export interface Transport {
  readonly kind: "mock" | "websocket";
  snapshot<K extends TransportTopic>(topic: K): TransportSnapshots[K];
  publish(envelope: TransportEnvelope): void;
  subscribe(topic: TransportTopic, listener: TransportListener): () => void;
}
