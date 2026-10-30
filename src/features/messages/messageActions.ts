import type { RoomMessage } from "@/domain/types";
import { directThreadId, sendDirectMessage } from "@/features/direct/direct";
import { publishRooms } from "@/features/rooms/RoomDialogs";
import { currentClientId } from "@/session/currentIdentity";
import { getTransport } from "@/transport";

function stamp() {
  return new Date().toISOString();
}

function clock(sentAt: string) {
  return new Date(sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function reactInRoom(roomId: string, messageId: string, emoji: string) {
  const clientId = currentClientId();
  if (!clientId || !emoji.trim()) {
    return;
  }
  publishRooms("react", `react-${messageId}-${Date.now()}`, { roomId, messageId, emoji });
}

export function reactInDirect(peerId: string, messageId: string, emoji: string) {
  const clientId = currentClientId();
  if (!clientId || !peerId || !emoji.trim()) {
    return;
  }
  getTransport().publish({
    id: `react-${messageId}-${Date.now()}`,
    topic: "direct",
    type: "react",
    sentAt: stamp(),
    clientId,
    payload: {
      threadId: directThreadId(clientId, peerId),
      participantIds: [clientId, peerId].sort(),
      messageId,
      emoji,
    },
  });
}

export function editInRoom(roomId: string, message: RoomMessage, body: string) {
  const clientId = currentClientId();
  const next = body.trim();
  if (!clientId || !next || message.authorId !== clientId) {
    return;
  }
  publishRooms("edit", `edit-${message.id}-${Date.now()}`, {
    roomId,
    messageId: message.id,
    body: next,
    editedAt: stamp(),
  });
}

export function editInDirect(peerId: string, message: RoomMessage, body: string) {
  const clientId = currentClientId();
  const next = body.trim();
  if (!clientId || !peerId || !next || message.authorId !== clientId) {
    return;
  }
  getTransport().publish({
    id: `edit-${message.id}-${Date.now()}`,
    topic: "direct",
    type: "edit",
    sentAt: stamp(),
    clientId,
    payload: {
      threadId: directThreadId(clientId, peerId),
      participantIds: [clientId, peerId].sort(),
      messageId: message.id,
      body: next,
      editedAt: stamp(),
    },
  });
}

export function replyInRoom(
  roomId: string,
  parentId: string,
  body: string,
  author: string,
  inChannel: boolean,
) {
  const clientId = currentClientId();
  const next = body.trim();
  if (!clientId || !next) {
    return;
  }
  const sentAt = stamp();
  const message: RoomMessage = {
    id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    author,
    authorId: clientId,
    time: clock(sentAt),
    sentAt,
    body: next,
    parentId,
    ...(inChannel ? { inChannel: true } : {}),
  };
  getTransport().publish({
    id: message.id,
    topic: "rooms",
    type: "message",
    sentAt,
    clientId,
    payload: { roomId, message },
  });
}

export function replyInDirect(peerId: string, parentId: string, body: string, author: string, inChannel: boolean) {
  const clientId = currentClientId();
  const next = body.trim();
  if (!clientId || !next) {
    return;
  }
  const sentAt = stamp();
  const message: RoomMessage = {
    id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    author,
    authorId: clientId,
    time: clock(sentAt),
    sentAt,
    body: next,
    parentId,
    ...(inChannel ? { inChannel: true } : {}),
  };
  sendDirectMessage(peerId, message);
}
