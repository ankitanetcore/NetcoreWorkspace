import { useSyncExternalStore } from "react";

export type ConversationSelection = { kind: "room"; id: string } | { kind: "direct"; peerId: string };

let selection: ConversationSelection | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function selectRoom(id: string) {
  selection = { kind: "room", id };
  emit();
}

export function selectDirect(peerId: string) {
  selection = { kind: "direct", peerId };
  emit();
}

export function clearSelection() {
  selection = null;
  emit();
}

export function getSelection() {
  return selection;
}

export function useConversationSelection() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSelection,
    getSelection,
  );
}
