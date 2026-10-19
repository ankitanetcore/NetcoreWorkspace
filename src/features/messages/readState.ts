import { useSyncExternalStore } from "react";

import type { RoomMessage } from "@/domain/types";

const storageKey = "netcore.read";
let cursors: Record<string, string> = load();
const listeners = new Set<() => void>();

function load() {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value) {
        next[key] = value;
      }
    }
    return next;
  } catch {
    return {};
  }
}

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function persist() {
  try {
    globalThis.localStorage?.setItem(storageKey, JSON.stringify(cursors));
  } catch {
    // The in-memory cursor still updates the open workspace.
  }
}

export function markRead(conversationId: string, messageId: string) {
  if (!conversationId || !messageId || cursors[conversationId] === messageId) {
    return;
  }
  cursors = { ...cursors, [conversationId]: messageId };
  persist();
  emit();
}

export function unreadCount(conversationId: string, messages: RoomMessage[], selfId: string) {
  const cursor = cursors[conversationId];
  const index = cursor ? messages.findIndex((message) => message.id === cursor) : -1;
  const unseen = index < 0 ? messages : messages.slice(index + 1);
  return unseen.filter((message) => message.authorId && message.authorId !== selfId).length;
}

export function useReadVersion() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => cursors,
    () => cursors,
  );
}
