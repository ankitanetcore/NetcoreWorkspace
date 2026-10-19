import type { RoomMessage, WorkspaceFile } from "@/domain/types";
import { sendDirectMessage } from "@/features/direct/direct";
import { currentClientId } from "@/session/currentIdentity";
import { getTransport } from "@/transport";

function sharedMessage(file: WorkspaceFile, folderId: string, author: string): RoomMessage {
  const sentAt = new Date().toISOString();
  return {
    id: `share-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    author,
    authorId: currentClientId(),
    time: new Date(sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    sentAt,
    body: `Shared ${file.name}`,
    file: {
      fileId: file.id,
      name: file.name,
      folderId,
      mimeType: file.mimeType,
      size: file.size,
    },
  };
}

export function shareFileToRoom(roomId: string, file: WorkspaceFile, folderId: string, author: string) {
  const message = sharedMessage(file, folderId, author);
  getTransport().publish({
    id: message.id,
    topic: "rooms",
    type: "message",
    sentAt: message.sentAt || new Date().toISOString(),
    clientId: message.authorId,
    payload: { roomId, message },
  });
}

export function shareFileToPeer(peerId: string, file: WorkspaceFile, folderId: string, author: string) {
  sendDirectMessage(peerId, sharedMessage(file, folderId, author));
}
