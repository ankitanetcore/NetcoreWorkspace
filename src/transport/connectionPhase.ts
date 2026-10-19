export type ConnectionPhase = "connecting" | "connected" | "reconnecting" | "disconnected";

const listeners = new Set<(phase: ConnectionPhase) => void>();
let phase: ConnectionPhase = "connecting";

export function connectionPhase() {
  return phase;
}

export function setConnectionPhase(next: ConnectionPhase) {
  if (phase === next) {
    return;
  }
  phase = next;
  for (const listener of listeners) {
    listener(next);
  }
}

export function subscribeConnection(listener: (phase: ConnectionPhase) => void) {
  listeners.add(listener);
  listener(phase);
  return () => {
    listeners.delete(listener);
  };
}
