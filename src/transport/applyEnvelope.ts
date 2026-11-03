import { memberIdsFrom, roomAccessFrom } from "@/domain/membership";
import { folderParentId } from "@/features/files/folderTree";
import { directThreadId } from "@/features/direct/direct";
import { toggleReaction } from "@/features/messages/messageModel";
import type { MessageReaction, PresencePeer, RoomMessage, SharedFileRef, WorkspaceFile } from "@/domain/types";
import { cleanLine, cleanPhoto } from "@/session/profile";
import { currentClientId } from "@/session/currentIdentity";
import type { TransportEnvelope, TransportSnapshots } from "@/transport/types";

interface MessagePayload {
  roomId?: string;
  message?: RoomMessage;
}

interface FileCreatePayload {
  folderId?: string;
  file?: WorkspaceFile;
}

interface FileUpdatePayload {
  folderId?: string;
  fileId?: string;
  body?: string;
}

interface PresencePayload {
  peers?: Array<Partial<PresencePeer>>;
}

function nestedFolderIds(folders: Array<{ id: string; parentId?: string }>, rootId: string) {
  const ids = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        grew = true;
      }
    }
  }
  return ids;
}

function sharedFileFrom(value: unknown): SharedFileRef | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const file = value as Partial<SharedFileRef>;
  if (typeof file.fileId !== "string" || !file.fileId || typeof file.name !== "string" || !file.name) {
    return undefined;
  }
  const shared: SharedFileRef = {
    fileId: file.fileId,
    name: file.name,
    folderId: typeof file.folderId === "string" ? file.folderId : "",
  };
  if (typeof file.mimeType === "string" && file.mimeType) {
    shared.mimeType = file.mimeType;
  }
  if (typeof file.size === "number" && file.size >= 0) {
    shared.size = file.size;
  }
  return shared;
}

function storedReactions(value: unknown): MessageReaction[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const reactions: MessageReaction[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Partial<MessageReaction>;
    if (typeof record.emoji !== "string" || !record.emoji.trim()) {
      continue;
    }
    const authorIds = memberIdsFrom(record.authorIds);
    if (authorIds.length === 0) {
      continue;
    }
    reactions.push({ emoji: record.emoji.trim(), authorIds });
  }
  return reactions.length > 0 ? reactions : undefined;
}

function storedMessages(value: unknown): RoomMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const messages: RoomMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Partial<RoomMessage>;
    if (typeof record.id !== "string" || !record.id || messages.some((message) => message.id === record.id)) {
      continue;
    }
    const message: RoomMessage = {
      id: record.id,
      author: typeof record.author === "string" ? record.author : "",
      authorId: typeof record.authorId === "string" ? record.authorId : undefined,
      time: typeof record.time === "string" ? record.time : "",
      sentAt: typeof record.sentAt === "string" ? record.sentAt : undefined,
      body: typeof record.body === "string" ? record.body : "",
      file: sharedFileFrom(record.file),
    };
    if (record.format === "markdown") {
      message.format = "markdown";
    }
    if (typeof record.parentId === "string" && record.parentId && record.parentId !== record.id) {
      message.parentId = record.parentId;
      if (record.inChannel === true) {
        message.inChannel = true;
      }
    }
    if (typeof record.editedAt === "string" && record.editedAt) {
      message.editedAt = record.editedAt;
    }
    const reactions = storedReactions(record.reactions);
    if (reactions) {
      message.reactions = reactions;
    }
    messages.push(message);
  }
  return messages;
}

export function applyEnvelope(snapshots: TransportSnapshots, envelope: TransportEnvelope) {
  if (envelope.topic === "presence") {
    const payload = envelope.payload as PresencePayload;
    const seen = new Set<string>();
    const peers: PresencePeer[] = [];
    for (const peer of payload.peers ?? []) {
      if (!peer.clientId || seen.has(peer.clientId)) {
        continue;
      }
      seen.add(peer.clientId);
      const next: PresencePeer = {
        clientId: peer.clientId,
        displayName: peer.displayName?.trim() || "",
        status: peer.status === "online" ? "online" : "offline",
        connectedAt: peer.connectedAt || "",
      };
      const title = cleanLine(peer.title);
      const location = cleanLine(peer.location);
      const photoUri = cleanPhoto(peer.photoUri);
      if (title) {
        next.title = title;
      }
      if (location) {
        next.location = location;
      }
      if (photoUri) {
        next.photoUri = photoUri;
      }
      peers.push(next);
    }
    snapshots.presence = { peers };
    return;
  }

  if (envelope.topic === "rooms" && envelope.type === "message") {
    const payload = envelope.payload as MessagePayload;
    const room = snapshots.rooms.rooms.find((item) => item.id === payload.roomId);
    const [message] = storedMessages(payload.message ? [payload.message] : []);
    if (!room || !message || room.messages.some((item) => item.id === message.id)) {
      return;
    }
    if (message.parentId && !room.messages.some((item) => item.id === message.parentId && !item.parentId)) {
      return;
    }
    room.messages.push(message);
    return;
  }

  if (envelope.topic === "rooms" && (envelope.type === "react" || envelope.type === "edit")) {
    const payload = envelope.payload as { roomId?: string; messageId?: string; emoji?: string; body?: string; editedAt?: string };
    const room = snapshots.rooms.rooms.find((item) => item.id === payload.roomId);
    const message = room?.messages.find((item) => item.id === payload.messageId);
    const actor = envelope.clientId || currentClientId();
    if (!message || !actor) {
      return;
    }
    if (envelope.type === "react") {
      toggleReaction(message, typeof payload.emoji === "string" ? payload.emoji : "", actor);
      return;
    }
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    if (!body || body.length > 8000 || message.authorId !== actor) {
      return;
    }
    message.body = body;
    message.editedAt = typeof payload.editedAt === "string" && payload.editedAt ? payload.editedAt : new Date().toISOString();
    return;
  }

  if (envelope.topic === "files" && envelope.type === "create") {
    const payload = envelope.payload as FileCreatePayload;
    const folder = snapshots.files.folders.find((item) => item.id === payload.folderId);
    const fileId = payload.file?.id;
    const alreadyStored = snapshots.files.folders.some((item) => item.files.some((file) => file.id === fileId));
    if (!folder || !payload.file || typeof fileId !== "string" || !fileId || typeof payload.file.name !== "string" || alreadyStored) {
      return;
    }
    folder.files.push({ ...payload.file });
    return;
  }

  if (envelope.topic === "files" && envelope.type === "update") {
    const payload = envelope.payload as FileUpdatePayload;
    const folder = snapshots.files.folders.find((item) => item.id === payload.folderId);
    const file = folder?.files.find((item) => item.id === payload.fileId);
    if (file && typeof payload.body === "string" && file.editable) {
      file.body = payload.body;
      file.detail = "Editing";
    }
    return;
  }

  if (envelope.topic === "files" && envelope.type === "folder-create") {
    const folder = (envelope.payload as { folder?: { id?: string; name?: string; parentId?: string } }).folder;
    const name = folder?.name?.trim();
    const parentId = folder?.parentId?.trim() ?? "";
    if (!folder?.id || !name || snapshots.files.folders.some((item) => item.id === folder.id)) {
      return;
    }
    if (parentId && !snapshots.files.folders.some((item) => item.id === parentId)) {
      return;
    }
    snapshots.files.folders.push({
      id: folder.id,
      name,
      files: [],
      ...(parentId ? { parentId } : {}),
    });
    return;
  }

  if (envelope.topic === "files" && envelope.type === "folder-rename") {
    const payload = envelope.payload as { folderId?: string; name?: string };
    const folder = snapshots.files.folders.find((item) => item.id === payload.folderId);
    const name = payload.name?.trim();
    if (folder && name) {
      folder.name = name;
    }
    return;
  }

  if (envelope.topic === "files" && envelope.type === "folder-delete") {
    const folderId = (envelope.payload as { folderId?: string }).folderId;
    if (!folderId) {
      return;
    }
    const ids = nestedFolderIds(snapshots.files.folders, folderId);
    snapshots.files.folders = snapshots.files.folders.filter((item) => !ids.has(item.id));
    return;
  }

  if (envelope.topic === "files" && envelope.type === "folder-move") {
    const payload = envelope.payload as { folderId?: string; parentId?: string };
    const folder = snapshots.files.folders.find((item) => item.id === payload.folderId);
    if (!folder) {
      return;
    }
    const parentId = payload.parentId?.trim() ?? "";
    if (!parentId) {
      delete folder.parentId;
      return;
    }
    if (parentId === folder.id || nestedFolderIds(snapshots.files.folders, folder.id).has(parentId)) {
      return;
    }
    if (!snapshots.files.folders.some((item) => item.id === parentId)) {
      return;
    }
    folder.parentId = parentId;
    return;
  }

  if (envelope.topic === "files" && envelope.type === "folder-reorder") {
    const payload = envelope.payload as { parentId?: string; folderIds?: unknown };
    const parentId = payload.parentId?.trim() ?? "";
    const folderIds = Array.isArray(payload.folderIds)
      ? payload.folderIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
    if (new Set(folderIds).size !== folderIds.length) {
      return;
    }
    const siblings = snapshots.files.folders.filter((folder) => (folderParentId(snapshots.files.folders, folder) ?? "") === parentId);
    if (folderIds.length !== siblings.length || folderIds.some((id) => !siblings.some((folder) => folder.id === id))) {
      return;
    }
    folderIds.forEach((id, index) => {
      const folder = snapshots.files.folders.find((item) => item.id === id);
      if (folder) {
        folder.order = index;
      }
    });
    return;
  }

  if (envelope.topic === "files" && envelope.type === "file-rename") {
    const payload = envelope.payload as { fileId?: string; name?: string; modifiedAt?: string };
    const name = payload.name?.trim();
    if (!payload.fileId || !name) {
      return;
    }
    for (const folder of snapshots.files.folders) {
      const file = folder.files.find((item) => item.id === payload.fileId);
      if (file) {
        file.name = name;
        if (payload.modifiedAt) {
          file.modifiedAt = payload.modifiedAt;
        }
        return;
      }
    }
    return;
  }

  if (envelope.topic === "files" && envelope.type === "file-pin") {
    const payload = envelope.payload as { fileId?: string; pinned?: boolean };
    if (!payload.fileId) {
      return;
    }
    for (const folder of snapshots.files.folders) {
      const file = folder.files.find((item) => item.id === payload.fileId);
      if (file) {
        if (payload.pinned === true) {
          file.pinned = true;
        } else {
          delete file.pinned;
        }
        return;
      }
    }
    return;
  }

  if (envelope.topic === "files" && envelope.type === "file-delete") {
    const fileId = (envelope.payload as { fileId?: string }).fileId;
    if (!fileId) {
      return;
    }
    for (const folder of snapshots.files.folders) {
      folder.files = folder.files.filter((file) => file.id !== fileId);
    }
    return;
  }

  if (envelope.topic === "files" && envelope.type === "file-organize") {
    const payload = envelope.payload as { folderId?: string; file?: WorkspaceFile };
    const folder = snapshots.files.folders.find((item) => item.id === payload.folderId);
    const file = payload.file;
    if (!folder || !file?.id) {
      return;
    }
    for (const item of snapshots.files.folders) {
      if (item.id === folder.id) {
        continue;
      }
      item.files = item.files.filter((existing) => existing.id !== file.id);
    }
    if (!folder.files.some((existing) => existing.id === file.id)) {
      folder.files.push({ ...file });
    }
    return;
  }

  if (envelope.topic === "files" && envelope.type === "file-move") {
    const payload = envelope.payload as { fileId?: string; toFolderId?: string };
    const target = snapshots.files.folders.find((item) => item.id === payload.toFolderId);
    if (!payload.fileId || !target) {
      return;
    }
    let moving: WorkspaceFile | undefined;
    for (const folder of snapshots.files.folders) {
      const index = folder.files.findIndex((file) => file.id === payload.fileId);
      if (index < 0) {
        continue;
      }
      if (folder.id === target.id) {
        return;
      }
      moving = folder.files[index];
      folder.files.splice(index, 1);
      break;
    }
    if (moving && !target.files.some((file) => file.id === moving?.id)) {
      target.files.push(moving);
    }
    return;
  }

  if (envelope.topic === "rooms" && envelope.type === "create") {
    const room = (
      envelope.payload as {
        room?: { id?: string; name?: string; access?: unknown; memberIds?: unknown; messages?: unknown; ownerId?: unknown };
      }
    ).room;
    const name = typeof room?.name === "string" ? room.name.trim() : "";
    const roomId = typeof room?.id === "string" ? room.id.trim() : "";
    if (!room || !roomId || !name || snapshots.rooms.rooms.some((item) => item.id === roomId)) {
      return;
    }
    const access = roomAccessFrom(room.access);
    const memberIds = access === "selected" ? memberIdsFrom(room.memberIds) : [];
    if (access === "selected" && !memberIds.includes(currentClientId())) {
      return;
    }
    snapshots.rooms.rooms.push({
      id: roomId,
      name,
      access,
      memberIds,
      messages: storedMessages(room.messages),
      ...(typeof room.ownerId === "string" && room.ownerId ? { ownerId: room.ownerId } : {}),
    });
    return;
  }

  if (envelope.topic === "rooms" && envelope.type === "rename") {
    const payload = envelope.payload as { roomId?: string; name?: string };
    const room = snapshots.rooms.rooms.find((item) => item.id === payload.roomId);
    const name = payload.name?.trim();
    if (room && name) {
      room.name = name;
    }
    return;
  }

  if (envelope.topic === "rooms" && envelope.type === "members") {
    const payload = envelope.payload as { roomId?: string; memberIds?: unknown };
    const room = snapshots.rooms.rooms.find((item) => item.id === payload.roomId);
    if (!room) {
      return;
    }
    room.access = "selected";
    room.memberIds = memberIdsFrom(payload.memberIds);
    if (!room.memberIds.includes(currentClientId())) {
      snapshots.rooms.rooms = snapshots.rooms.rooms.filter((item) => item.id !== room.id);
    }
    return;
  }

  if (envelope.topic === "rooms" && envelope.type === "delete") {
    const roomId = (envelope.payload as { roomId?: string }).roomId;
    if (!roomId) {
      return;
    }
    snapshots.rooms.rooms = snapshots.rooms.rooms.filter((item) => item.id !== roomId);
    return;
  }

  if (envelope.topic === "direct" && envelope.type === "open") {
    const participantIds = memberIdsFrom((envelope.payload as { participantIds?: unknown }).participantIds).sort();
    const me = currentClientId();
    if (participantIds.length !== 2 || !participantIds.includes(me)) {
      return;
    }
    const threadId = directThreadId(participantIds[0], participantIds[1]);
    if (snapshots.direct.threads.some((thread) => thread.id === threadId)) {
      return;
    }
    snapshots.direct.threads.push({ id: threadId, participantIds, messages: [] });
    return;
  }

  if (envelope.topic === "direct" && envelope.type === "message") {
    const payload = envelope.payload as { participantIds?: unknown; message?: RoomMessage };
    const participantIds = memberIdsFrom(payload.participantIds).sort();
    const me = currentClientId();
    if (participantIds.length !== 2 || !participantIds.includes(me) || !payload.message?.id) {
      return;
    }
    const threadId = directThreadId(participantIds[0], participantIds[1]);
    let thread = snapshots.direct.threads.find((item) => item.id === threadId);
    if (!thread) {
      thread = { id: threadId, participantIds, messages: [] };
      snapshots.direct.threads.push(thread);
    }
    if (thread.messages.some((item) => item.id === payload.message?.id)) {
      return;
    }
    const [message] = storedMessages([payload.message]);
    if (!message) {
      return;
    }
    if (message.parentId && !thread.messages.some((item) => item.id === message.parentId && !item.parentId)) {
      return;
    }
    thread.messages.push(message);
    return;
  }

  if (envelope.topic === "direct" && (envelope.type === "react" || envelope.type === "edit")) {
    const payload = envelope.payload as {
      participantIds?: unknown;
      messageId?: string;
      emoji?: string;
      body?: string;
      editedAt?: string;
    };
    const participantIds = memberIdsFrom(payload.participantIds).sort();
    const me = currentClientId();
    if (participantIds.length !== 2 || !participantIds.includes(me)) {
      return;
    }
    const thread = snapshots.direct.threads.find((item) => item.id === directThreadId(participantIds[0], participantIds[1]));
    const message = thread?.messages.find((item) => item.id === payload.messageId);
    const actor = envelope.clientId || me;
    if (!message || !actor) {
      return;
    }
    if (envelope.type === "react") {
      toggleReaction(message, typeof payload.emoji === "string" ? payload.emoji : "", actor);
      return;
    }
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    if (!body || body.length > 8000 || message.authorId !== actor) {
      return;
    }
    message.body = body;
    message.editedAt = typeof payload.editedAt === "string" && payload.editedAt ? payload.editedAt : new Date().toISOString();
  }
}
