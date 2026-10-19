import { applyEnvelope } from "@/transport/applyEnvelope";
import type {
  Transport,
  TransportEnvelope,
  TransportListener,
  TransportSnapshots,
  TransportTopic,
} from "@/transport/types";

export function createMockTransport(snapshots: TransportSnapshots): Transport {
  const subscribers = new Map<TransportTopic, Set<TransportListener>>();

  return {
    kind: "mock",
    snapshot(topic) {
      return snapshots[topic];
    },
    publish(envelope) {
      applyEnvelope(snapshots, envelope);
      const listeners = subscribers.get(envelope.topic);
      if (!listeners) {
        return;
      }
      for (const listener of listeners) {
        listener(envelope);
      }
    },
    subscribe(topic, listener) {
      const listeners = subscribers.get(topic) ?? new Set<TransportListener>();
      listeners.add(listener);
      subscribers.set(topic, listeners);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
