import type { DirectThread, RoomMessage } from "@/domain/types";
import { currentClientId } from "@/session/currentIdentity";
import { getTransport } from "@/transport";

export function directThreadId(left: string, right: string) {
  const [first, second] = [left, right].sort();
  return `direct-${first}--${second}`;
}

export function readDirectThreads(): DirectThread[] {
  const me = currentClientId();
  return getTransport()
    .snapshot("direct")
    .threads.filter((thread) => thread.participantIds.includes(me))
    .map((thread) => ({
      ...thread,
      participantIds: [...thread.participantIds],
      messages: thread.messages.map((message) => ({ ...message })),
    }));
}

export function threadForPeer(peerId: string) {
  const me = currentClientId();
  if (!me || !peerId || me === peerId) {
    return null;
  }
  const id = directThreadId(me, peerId);
  return readDirectThreads().find((thread) => thread.id === id) ?? null;
}

export function sendDirectMessage(peerId: string, message: RoomMessage) {
  const me = currentClientId();
  if (!me || !peerId || me === peerId) {
    return;
  }
  const participantIds = [me, peerId].sort();
  getTransport().publish({
    id: message.id,
    topic: "direct",
    type: "message",
    sentAt: message.sentAt || new Date().toISOString(),
    clientId: me,
    payload: {
      threadId: directThreadId(me, peerId),
      participantIds,
      message,
    },
  });
}
