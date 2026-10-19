import { createServer } from "node:http";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const port = 8082;
const root = join(fileURLToPath(new URL("..", import.meta.url)), "dist");
const dataDir = join(fileURLToPath(new URL(".", import.meta.url)), "data");
const workspacePath = join(dataDir, "workspace.json");
const directoryPath = join(dataDir, "directory.json");
const binaryDir = join(dataDir, "binaries");
const mediaDir = join(dataDir, "media");
const clients = new Set();

const workspace = {
  direct: {
    threads: [],
  },
  rooms: {
    rooms: [
      { id: "general", name: "General", messages: [], access: "everyone", memberIds: [] },
      { id: "gtm", name: "GTM", messages: [], access: "everyone", memberIds: [] },
      { id: "engineering", name: "Engineering", messages: [], access: "everyone", memberIds: [] },
    ],
  },
  files: {
    folders: [
      { id: "yours", name: "Yours", files: [] },
      {
        id: "notes",
        name: "Notes",
        files: [
          {
            id: "yesterday",
            name: "yesterday.txt",
            detail: "Updated yesterday",
            body: "Yesterday\n\nGeneral is for everyday conversation.\nGTM is for go-to-market work.\nEngineering is for the build.",
          },
          {
            id: "open-questions",
            name: "open-questions.txt",
            detail: "Updated this morning",
            body: "Open questions\n\nWho keeps the shared notes current?\nShould sketches stay beside the notes?\nWhat do we want to look at together on the next call?",
          },
        ],
      },
      {
        id: "sketches",
        name: "Sketches",
        files: [
          {
            id: "table-layout",
            name: "table-layout.txt",
            detail: "Updated yesterday",
            body: "Table layout\n\nA long table, three seats, and a clear wall for notes.\nKeep the middle open so people can gather without a fixed front.",
          },
        ],
      },
      {
        id: "shared",
        name: "Shared",
        files: [
          {
            id: "welcome",
            name: "welcome.txt",
            detail: "Updated last week",
            body: "Shared\n\nThis folder is for anything the whole group should be able to find.\nThe notes and the table sketch are the current set.",
          },
        ],
      },
    ],
  },
  attachments: [],
};
const transfers = new Map();
const mediaJobs = new Map();
const transferAudience = new Map();
// Peers seen during this server session. Disconnect marks them offline and keeps the record.
const presence = new Map();
const calls = new Map();

function findFolder(folderId) {
  return workspace.files.folders.find((folder) => folder.id === folderId);
}

function findFile(fileId) {
  for (const folder of workspace.files.folders) {
    const file = folder.files.find((item) => item.id === fileId);
    if (file) {
      return file;
    }
  }
  return undefined;
}

function findAttachment(fileId) {
  return workspace.attachments.find((item) => item.id === fileId);
}

function safeFileId(fileId) {
  const safe = String(fileId ?? "").replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!safe || safe === "." || safe === "..") {
    return null;
  }
  return safe;
}

function rawMediaPath(fileId) {
  const safe = safeFileId(fileId);
  return safe ? join(mediaDir, safe) : null;
}

function legacyBinaryPath(fileId) {
  return join(binaryDir, safeBinaryName(fileId));
}

function deleteStoredBytes(fileId) {
  const raw = rawMediaPath(fileId);
  if (raw) {
    rmSync(raw, { force: true });
    rmSync(`${raw}.partial`, { force: true });
  }
  rmSync(legacyBinaryPath(fileId), { force: true });
}

function hasStoredBytes(fileId) {
  const raw = rawMediaPath(fileId);
  return Boolean((raw && existsSync(raw)) || existsSync(legacyBinaryPath(fileId)));
}

function forgetStoredFile(fileId) {
  const attachment = findAttachment(fileId);
  if (attachment) {
    attachment.folderId = "";
    return;
  }
  deleteStoredBytes(fileId);
  for (const [transferId, record] of transfers) {
    if (record.fileId === fileId) {
      transfers.delete(transferId);
    }
  }
}

function canSeeAudience(audience, clientId) {
  if (!audience) {
    return true;
  }
  if (audience.kind === "room") {
    const room = workspace.rooms.rooms.find((item) => item.id === audience.roomId);
    return canAccessRoom(room, clientId);
  }
  if (audience.kind === "direct") {
    return Array.isArray(audience.participantIds) && audience.participantIds.includes(clientId);
  }
  return false;
}

function canSeeStoredFile(file, clientId) {
  return canSeeAudience(file?.audience, clientId);
}

function audienceFits(audience, conversation) {
  if (!audience) {
    return true;
  }
  if (audience.kind === "room" && conversation.kind === "room") {
    return audience.roomId === conversation.roomId;
  }
  if (audience.kind === "direct" && conversation.kind === "direct") {
    const left = [...(audience.participantIds || [])].sort().join("\0");
    const right = [...(conversation.participantIds || [])].sort().join("\0");
    return left === right;
  }
  return false;
}

function cleanSharedFile(file) {
  if (!file || typeof file.fileId !== "string" || !file.fileId || typeof file.name !== "string" || !file.name.trim()) {
    return undefined;
  }
  const shared = {
    fileId: file.fileId,
    name: file.name.trim(),
    folderId: typeof file.folderId === "string" ? file.folderId : "",
  };
  if (typeof file.mimeType === "string" && file.mimeType) {
    shared.mimeType = file.mimeType;
  }
  if (typeof file.size === "number" && Number.isFinite(file.size) && file.size >= 0) {
    shared.size = file.size;
  }
  return shared;
}

function acceptedSharedFile(file, actor, conversation) {
  const shared = cleanSharedFile(file);
  if (!shared) {
    return undefined;
  }
  const stored = findAttachment(shared.fileId) || findFile(shared.fileId);
  if (!stored || !canSeeStoredFile(stored, actor) || (stored.audience && !audienceFits(stored.audience, conversation))) {
    return undefined;
  }
  return shared;
}

function readAudience(payload, actor) {
  const audience = payload?.audience;
  if (!audience || typeof audience !== "object") {
    return null;
  }
  if (audience.kind === "room" && typeof audience.roomId === "string") {
    const room = workspace.rooms.rooms.find((item) => item.id === audience.roomId);
    if (!canAccessRoom(room, actor)) {
      return null;
    }
    return { kind: "room", roomId: room.id };
  }
  if (audience.kind === "direct") {
    const ids = memberIdsFrom(audience.participantIds);
    const other = ids.find((id) => id !== actor);
    if (!actor || ids.length !== 2 || !ids.includes(actor) || !other || !presence.has(other)) {
      return null;
    }
    return { kind: "direct", participantIds: [...ids].sort() };
  }
  return null;
}

function noteFolder(fileId, folderId) {
  for (const room of workspace.rooms.rooms) {
    for (const message of room.messages) {
      if (message.file?.fileId === fileId) {
        message.file.folderId = folderId;
      }
    }
  }
  for (const thread of workspace.direct.threads) {
    for (const message of thread.messages) {
      if (message.file?.fileId === fileId) {
        message.file.folderId = folderId;
      }
    }
  }
}

function safeBinaryName(fileId) {
  return `${String(fileId).replace(/[^a-zA-Z0-9._-]/g, "_")}.json`;
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeWorkspace, 40);
}

function writeWorkspace() {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    workspacePath,
    JSON.stringify({
      rooms: workspace.rooms,
      direct: workspace.direct,
      files: workspace.files,
      attachments: workspace.attachments,
    }),
  );
}

function loadPersisted() {
  if (!existsSync(workspacePath)) {
    return;
  }
  try {
    const saved = JSON.parse(readFileSync(workspacePath, "utf8"));
    if (saved.rooms?.rooms) {
      workspace.rooms = saved.rooms;
    }
    if (saved.direct?.threads) {
      workspace.direct = saved.direct;
    }
    if (saved.files?.folders) {
      workspace.files = saved.files;
    }
    workspace.attachments = Array.isArray(saved.attachments) ? saved.attachments : [];
  } catch (error) {
    console.log("Workspace storage could not be read", error);
  }
}

function memberIdsFrom(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const ids = [];
  for (const item of value) {
    if (typeof item === "string" && item && !ids.includes(item)) {
      ids.push(item);
    }
  }
  return ids;
}

function normalizeRoomRecord(room) {
  return {
    access: room?.access === "selected" ? "selected" : "everyone",
    memberIds: memberIdsFrom(room?.memberIds),
  };
}

function canAccessRoom(room, clientId) {
  if (!room) {
    return false;
  }
  const { access, memberIds } = normalizeRoomRecord(room);
  if (access !== "selected") {
    return true;
  }
  return Boolean(clientId) && memberIds.includes(clientId);
}

function publicRoom(room) {
  const { access, memberIds } = normalizeRoomRecord(room);
  return {
    id: room.id,
    name: room.name,
    messages: room.messages,
    access,
    memberIds: access === "selected" ? memberIds : [],
  };
}

function rememberWorkspace(envelope, actorId = "") {
  const actor = envelope.clientId || actorId || "";
  if (envelope.topic === "rooms" && envelope.type === "message") {
    const payload = envelope.payload ?? {};
    const room = workspace.rooms.rooms.find((item) => item.id === payload.roomId);
    const message = payload.message;
    if (!room || !canAccessRoom(room, actor) || !message || room.messages.some((item) => item.id === message.id)) {
      return { kind: "drop" };
    }
    const body = typeof message.body === "string" ? message.body.trim() : "";
    const shared = acceptedSharedFile(message.file, actor, { kind: "room", roomId: room.id });
    if (!message.id || (!body && !shared)) {
      return { kind: "drop" };
    }
    const stored = {
      id: message.id,
      author: typeof message.author === "string" ? message.author : "",
      authorId: typeof message.authorId === "string" ? message.authorId : actor,
      time: typeof message.time === "string" ? message.time : "",
      sentAt: typeof message.sentAt === "string" ? message.sentAt : new Date().toISOString(),
      body,
      file: shared,
    };
    if (message.format === "markdown") {
      stored.format = "markdown";
    }
    room.messages.push(stored);
    return { kind: "message", room, message: stored };
  }
  if (envelope.topic === "rooms" && envelope.type === "create") {
    const room = envelope.payload?.room;
    const name = typeof room?.name === "string" ? room.name.trim() : "";
    if (!room?.id || !name || workspace.rooms.rooms.some((item) => item.id === room.id)) {
      return { kind: "drop" };
    }
    let { access, memberIds } = normalizeRoomRecord(room);
    if (access === "selected") {
      memberIds = memberIds.filter((id) => id === actor || presence.has(id));
      if (actor && !memberIds.includes(actor)) {
        memberIds.unshift(actor);
      }
      if (!actor || !memberIds.includes(actor)) {
        return { kind: "drop" };
      }
    } else {
      access = "everyone";
      memberIds = [];
    }
    const stored = { id: room.id, name, messages: [], access, memberIds };
    workspace.rooms.rooms.push(stored);
    return { kind: "create", room: stored };
  }
  if (envelope.topic === "rooms" && envelope.type === "rename") {
    const roomId = envelope.payload?.roomId;
    const name = typeof envelope.payload?.name === "string" ? envelope.payload.name.trim() : "";
    const room = workspace.rooms.rooms.find((item) => item.id === roomId);
    if (!room || !name || !canAccessRoom(room, actor)) {
      return { kind: "drop" };
    }
    room.name = name;
    return { kind: "rename", room };
  }
  if (envelope.topic === "rooms" && envelope.type === "members") {
    const room = workspace.rooms.rooms.find((item) => item.id === envelope.payload?.roomId);
    if (!room || !canAccessRoom(room, actor)) {
      return { kind: "drop" };
    }
    const current = normalizeRoomRecord(room);
    const before = current.access === "selected" ? memberIdsFrom(room.memberIds) : [...presence.keys()];
    if (actor && !before.includes(actor)) {
      before.unshift(actor);
    }
    let next = memberIdsFrom(envelope.payload?.memberIds).filter((id) => id === actor || presence.has(id));
    if (actor && before.includes(actor) && !next.includes(actor)) {
      next.unshift(actor);
    }
    const gained = next.filter((id) => !before.includes(id));
    const lost = before.filter((id) => !next.includes(id));
    room.access = "selected";
    room.memberIds = next;
    return { kind: "members", room, gained, lost };
  }
  if (envelope.topic === "rooms" && envelope.type === "delete") {
    const roomId = envelope.payload?.roomId;
    const room = workspace.rooms.rooms.find((item) => item.id === roomId);
    if (!room || !canAccessRoom(room, actor)) {
      return { kind: "drop" };
    }
    const hadCall = calls.has(roomId);
    calls.delete(roomId);
    workspace.rooms.rooms = workspace.rooms.rooms.filter((item) => item.id !== roomId);
    return { kind: "delete", room, hadCall };
  }
  if (envelope.topic === "rooms") {
    return { kind: "drop" };
  }
  if (envelope.topic === "files" && envelope.type === "create") {
    const payload = envelope.payload ?? {};
    const folder = findFolder(payload.folderId);
    const file = payload.file;
    const alreadyStored = workspace.files.folders.some((item) => item.files.some((existing) => existing.id === file?.id));
    if (!folder || !file?.id || alreadyStored) {
      return;
    }
    const { mine: _mine, ...stored } = file;
    folder.files.push(stored);
    return;
  }
  if (envelope.topic === "files" && envelope.type === "update") {
    const payload = envelope.payload ?? {};
    const file = findFile(payload.fileId);
    if (file && typeof payload.body === "string" && file.editable) {
      file.body = payload.body;
      file.detail = "Editing";
    }
    return;
  }
  if (envelope.topic === "files" && envelope.type === "folder-create") {
    const folder = envelope.payload?.folder;
    const name = typeof folder?.name === "string" ? folder.name.trim() : "";
    if (!folder?.id || !name || workspace.files.folders.some((item) => item.id === folder.id)) {
      return;
    }
    workspace.files.folders.push({ id: folder.id, name, files: [] });
    return;
  }
  if (envelope.topic === "files" && envelope.type === "folder-rename") {
    const folder = findFolder(envelope.payload?.folderId);
    const name = typeof envelope.payload?.name === "string" ? envelope.payload.name.trim() : "";
    if (folder && name) {
      folder.name = name;
    }
    return;
  }
  if (envelope.topic === "files" && envelope.type === "folder-delete") {
    const folder = findFolder(envelope.payload?.folderId);
    if (!folder) {
      return;
    }
    for (const file of folder.files) {
      forgetStoredFile(file.id);
    }
    workspace.files.folders = workspace.files.folders.filter((item) => item.id !== folder.id);
    return;
  }
  if (envelope.topic === "files" && envelope.type === "file-rename") {
    const file = findFile(envelope.payload?.fileId);
    const name = typeof envelope.payload?.name === "string" ? envelope.payload.name.trim() : "";
    if (file && name) {
      file.name = name;
    }
    return;
  }
  if (envelope.topic === "files" && envelope.type === "file-delete") {
    const fileId = envelope.payload?.fileId;
    if (!fileId) {
      return;
    }
    for (const folder of workspace.files.folders) {
      folder.files = folder.files.filter((file) => file.id !== fileId);
    }
    forgetStoredFile(fileId);
    return;
  }
  if (envelope.topic === "files" && envelope.type === "file-move") {
    const fileId = envelope.payload?.fileId;
    const target = findFolder(envelope.payload?.toFolderId);
    if (!fileId || !target) {
      return;
    }
    let moving;
    for (const folder of workspace.files.folders) {
      const index = folder.files.findIndex((file) => file.id === fileId);
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
    if (moving && !target.files.some((file) => file.id === fileId)) {
      target.files.push(moving);
    }
    return;
  }
  if (envelope.topic === "files" && envelope.type === "file-start") {
    const payload = envelope.payload ?? {};
    if (!payload.transferId || !payload.fileId) {
      return;
    }
    const chat = !payload.folderId;
    const audience = chat ? readAudience(payload, actor) : null;
    if (chat && !audience) {
      return;
    }
    transferAudience.set(payload.transferId, audience);
    transfers.set(payload.transferId, {
      fileId: payload.fileId,
      folderId: payload.folderId || "",
      name: payload.name,
      mimeType: payload.mimeType || "application/octet-stream",
      size: payload.size ?? 0,
      chunkCount: payload.chunkCount ?? 0,
      editable: Boolean(payload.editable),
      body: payload.body ?? "",
      detail: payload.detail || "Uploaded",
      clientId: payload.clientId || envelope.clientId || actor || "",
      chunks: [],
      chat,
      audience,
    });
    return;
  }
  if (envelope.topic === "files" && envelope.type === "file-chunk") {
    const payload = envelope.payload ?? {};
    const record = transfers.get(payload.transferId);
    if (!record || typeof payload.index !== "number" || typeof payload.data !== "string") {
      return;
    }
    record.chunks[payload.index] = payload.data;
    return;
  }
  if (envelope.topic === "files" && envelope.type === "file-end") {
    const record = transfers.get(envelope.payload?.transferId);
    if (!record) {
      return;
    }
    transfers.delete(envelope.payload.transferId);
    const parts = record.chunks.filter((chunk) => typeof chunk === "string").map((chunk) => Buffer.from(chunk, "base64"));
    const raw = rawMediaPath(record.fileId);
    if (raw) {
      mkdirSync(mediaDir, { recursive: true });
      writeFileSync(raw, Buffer.concat(parts));
      rmSync(legacyBinaryPath(record.fileId), { force: true });
    }
    if (record.chat) {
      if (!findAttachment(record.fileId)) {
        workspace.attachments.push({
          id: record.fileId,
          name: record.name || "file",
          detail: record.detail,
          body: record.body,
          editable: record.editable,
          mimeType: record.mimeType,
          size: record.size,
          clientId: record.clientId || undefined,
          audience: record.audience,
          folderId: "",
        });
      }
      return;
    }
    if (!findFile(record.fileId)) {
      const folder = findFolder(record.folderId);
      folder?.files.push({
        id: record.fileId,
        name: record.name || "file",
        detail: record.detail,
        body: record.body,
        editable: record.editable,
        mimeType: record.mimeType,
        size: record.size,
        clientId: record.clientId || undefined,
      });
    }
  }
  if (envelope.topic === "files" && envelope.type === "file-organize") {
    const fileId = envelope.payload?.fileId;
    const folder = findFolder(envelope.payload?.folderId);
    const attachment = findAttachment(fileId);
    if (!folder || !attachment || !canSeeStoredFile(attachment, actor)) {
      return { kind: "drop" };
    }
    const stored = {
      id: attachment.id,
      name: attachment.name,
      detail: attachment.detail,
      body: attachment.body,
      editable: attachment.editable,
      mimeType: attachment.mimeType,
      size: attachment.size,
      clientId: attachment.clientId,
      audience: attachment.audience,
    };
    for (const item of workspace.files.folders) {
      item.files = item.files.filter((file) => file.id !== attachment.id);
    }
    if (!folder.files.some((file) => file.id === attachment.id)) {
      folder.files.push(stored);
    }
    attachment.folderId = folder.id;
    noteFolder(attachment.id, folder.id);
    return { kind: "organize", folderId: folder.id, file: stored, audience: attachment.audience };
  }
}

function callStatusPayload(roomId) {
  const call = calls.get(roomId);
  if (!call) {
    return { roomId, active: false };
  }
  return {
    roomId,
    active: true,
    startedBy: call.startedBy,
    startedName: call.startedName,
    participantIds: [...call.participants],
  };
}

function callStatusMessage(roomId, payload) {
  return JSON.stringify({
    id: `call-status-${roomId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    topic: "call",
    type: "status",
    sentAt: new Date().toISOString(),
    payload: payload ?? callStatusPayload(roomId),
  });
}

function roomEvent(type, payload) {
  return JSON.stringify({
    id: `rooms-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    topic: "rooms",
    type,
    sentAt: new Date().toISOString(),
    payload,
  });
}

function textFrame(data) {
  return typeof data === "string" ? data : data.toString();
}

function relayToAccess(room, data, except) {
  for (const client of clients) {
    if (client === except || client.readyState !== 1 || !canAccessRoom(room, client.clientId)) {
      continue;
    }
    client.send(data);
  }
}

function sendToPeer(clientId, data) {
  if (!clientId) {
    return;
  }
  for (const client of clients) {
    if (client.readyState === 1 && client.clientId === clientId) {
      client.send(data);
    }
  }
}

function relayRoomResult(result, raw, socket) {
  if (!result || result.kind === "drop") {
    return;
  }
  if (result.kind === "message") {
    const data = JSON.stringify({
      id: result.message.id,
      topic: "rooms",
      type: "message",
      sentAt: result.message.sentAt,
      payload: { roomId: result.room.id, message: result.message },
    });
    relayToAccess(result.room, data, socket);
    return;
  }
  if (result.kind === "create") {
    relayToAccess(result.room, roomEvent("create", { room: publicRoom(result.room) }), socket);
    return;
  }
  if (result.kind === "rename") {
    relayToAccess(result.room, roomEvent("rename", { roomId: result.room.id, name: result.room.name }), socket);
    return;
  }
  if (result.kind === "delete") {
    relayToAccess(result.room, roomEvent("delete", { roomId: result.room.id }), socket);
    if (result.hadCall) {
      relayToAccess(result.room, callStatusMessage(result.room.id, { roomId: result.room.id, active: false }), socket);
    }
    return;
  }
  if (result.kind === "members") {
    for (const id of result.gained) {
      sendToPeer(id, roomEvent("create", { room: publicRoom(result.room) }));
      if (calls.has(result.room.id)) {
        sendToPeer(id, callStatusMessage(result.room.id));
      }
    }
    relayToAccess(
      result.room,
      roomEvent("members", { roomId: result.room.id, memberIds: result.room.memberIds }),
      socket,
    );
    for (const id of result.lost) {
      sendToPeer(id, roomEvent("delete", { roomId: result.room.id }));
      if (calls.has(result.room.id)) {
        sendToPeer(id, callStatusMessage(result.room.id, { roomId: result.room.id, active: false }));
      }
    }
  }
}

function broadcastCallStatus(roomId) {
  const room = workspace.rooms.rooms.find((item) => item.id === roomId);
  const data = callStatusMessage(roomId);
  for (const client of clients) {
    if (client.readyState === 1 && canAccessRoom(room, client.clientId)) {
      client.send(data);
    }
  }
}

function removeCallParticipant(roomId, clientId) {
  const call = calls.get(roomId);
  if (!call || !call.participants.has(clientId)) {
    return;
  }
  call.participants.delete(clientId);
  if (call.participants.size === 0) {
    calls.delete(roomId);
  }
  broadcastCallStatus(roomId);
}

function rememberCall(envelope, socketClientId) {
  const type = envelope?.type;
  if (type !== "call-started" && type !== "join" && type !== "leave") {
    return;
  }
  const payload = envelope.payload ?? {};
  const roomId = typeof payload.roomId === "string" ? payload.roomId : "";
  const clientId = payload.clientId || payload.from || envelope.clientId || socketClientId || "";
  if (!roomId || !clientId) {
    return;
  }
  if (type === "call-started") {
    const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : "Someone";
    let call = calls.get(roomId);
    if (!call) {
      call = { startedBy: clientId, startedName: name, participants: new Set() };
      calls.set(roomId, call);
    }
    call.participants.add(clientId);
    broadcastCallStatus(roomId);
    return;
  }
  if (type === "join") {
    const call = calls.get(roomId);
    if (!call || call.participants.has(clientId)) {
      return;
    }
    call.participants.add(clientId);
    broadcastCallStatus(roomId);
    return;
  }
  removeCallParticipant(roomId, clientId);
}

function dropClientFromCalls(clientId) {
  if (!clientId) {
    return;
  }
  for (const [roomId, call] of [...calls.entries()]) {
    if (!call.participants.has(clientId)) {
      continue;
    }
    const leave = JSON.stringify({
      id: `call-leave-${clientId}-${Date.now()}`,
      topic: "call",
      type: "leave",
      sentAt: new Date().toISOString(),
      clientId,
      payload: { roomId, clientId },
    });
    const room = workspace.rooms.rooms.find((item) => item.id === roomId);
    relayToAccess(room, leave, null);
    removeCallParticipant(roomId, clientId);
  }
}

function abandonTransfers(clientId) {
  if (!clientId) {
    return;
  }
  for (const [transferId, record] of [...transfers.entries()]) {
    if (record.clientId !== clientId) {
      continue;
    }
    transfers.delete(transferId);
    if (hasStoredBytes(record.fileId)) {
      continue;
    }
    let removed = false;
    for (const folder of workspace.files.folders) {
      const next = folder.files.filter((file) => file.id !== record.fileId);
      if (next.length !== folder.files.length) {
        folder.files = next;
        removed = true;
      }
    }
    if (!removed) {
      continue;
    }
    const data = JSON.stringify({
      id: `file-delete-${record.fileId}-${Date.now()}`,
      topic: "files",
      type: "file-delete",
      sentAt: new Date().toISOString(),
      payload: { fileId: record.fileId },
    });
    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(data);
      }
    }
  }
}

function directThreadId(left, right) {
  const [first, second] = [left, right].sort();
  return `direct-${first}--${second}`;
}

function cleanDirectMessage(message, actor, other) {
  if (!message || typeof message.id !== "string" || !message.id) {
    return null;
  }
  const body = typeof message.body === "string" ? message.body.trim() : "";
  const shared = acceptedSharedFile(message.file, actor, { kind: "direct", participantIds: [actor, other] });
  if (!body && !shared) {
    return null;
  }
  const stored = {
    id: message.id,
    author: typeof message.author === "string" ? message.author.trim() : "",
    authorId: actor,
    time: typeof message.time === "string" ? message.time : "",
    sentAt: typeof message.sentAt === "string" ? message.sentAt : new Date().toISOString(),
    body,
    file: shared,
  };
  if (message.format === "markdown") {
    stored.format = "markdown";
  }
  return stored;
}

function rememberDirect(envelope, actorId = "") {
  if (envelope.type !== "message") {
    return { kind: "drop" };
  }
  const actor = envelope.clientId || actorId || "";
  const ids = memberIdsFrom(envelope.payload?.participantIds);
  const other = ids.find((id) => id !== actor);
  if (!actor || ids.length !== 2 || !ids.includes(actor) || !other || !presence.has(other)) {
    return { kind: "drop" };
  }
  const message = cleanDirectMessage(envelope.payload?.message, actor, other);
  if (!message) {
    return { kind: "drop" };
  }
  const id = directThreadId(actor, other);
  let thread = workspace.direct.threads.find((item) => item.id === id);
  if (!thread) {
    thread = { id, participantIds: [actor, other].sort(), messages: [] };
    workspace.direct.threads.push(thread);
  }
  if (thread.messages.some((item) => item.id === message.id)) {
    return { kind: "drop" };
  }
  thread.messages.push(message);
  return { kind: "message", thread, message };
}

function relayDirect(result, sender) {
  if (!result || result.kind !== "message") {
    return;
  }
  const data = JSON.stringify({
    id: result.message.id,
    topic: "direct",
    type: "message",
    sentAt: result.message.sentAt,
    payload: {
      threadId: result.thread.id,
      participantIds: result.thread.participantIds,
      message: result.message,
    },
  });
  for (const client of clients) {
    if (client === sender || client.readyState !== 1) {
      continue;
    }
    if (result.thread.participantIds.includes(client.clientId)) {
      client.send(data);
    }
  }
}

function visibleFiles(clientId) {
  return {
    folders: workspace.files.folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      files: folder.files.filter((file) => canSeeStoredFile(file, clientId)),
    })),
  };
}

function snapshotMessage(clientId) {
  const rooms = workspace.rooms.rooms.filter((room) => canAccessRoom(room, clientId)).map(publicRoom);
  const threads = workspace.direct.threads
    .filter((thread) => thread.participantIds.includes(clientId))
    .map((thread) => ({
      id: thread.id,
      participantIds: thread.participantIds,
      messages: thread.messages,
    }));
  return JSON.stringify({
    id: `snapshot-${Date.now()}`,
    topic: "workspace",
    type: "snapshot",
    sentAt: new Date().toISOString(),
    payload: {
      rooms: { rooms },
      direct: { threads },
      files: visibleFiles(clientId),
      calls: [...calls.entries()]
        .filter(([roomId]) => canAccessRoom(workspace.rooms.rooms.find((item) => item.id === roomId), clientId))
        .map(([roomId]) => callStatusPayload(roomId)),
    },
  });
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

function filePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = decoded === "/" ? "/index.html" : decoded;
  const full = normalize(join(root, relative));
  if (full !== root && !full.startsWith(root + sep)) {
    return null;
  }
  return full;
}

function sendFile(response, full) {
  const type = types[extname(full)] ?? "application/octet-stream";
  response.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": "no-cache",
  });
  createReadStream(full).pipe(response);
}

function contentName(name) {
  const cleaned = String(name || "file")
    .replace(/[^\t\x20-\x7E]/g, " ")
    .replace(/["\\]/g, "")
    .trim();
  return cleaned || "file";
}

function decodeBase64Chunk(pending, output) {
  const quote = pending.indexOf(0x22);
  const slice = quote >= 0 ? pending.subarray(0, quote) : pending;
  const take = slice.length - (slice.length % 4);
  let blocked = false;
  if (take > 0) {
    blocked = !output.write(Buffer.from(slice.subarray(0, take).toString("ascii"), "base64"));
  }
  if (quote >= 0) {
    return { done: true, blocked, rest: Buffer.alloc(0) };
  }
  return { done: false, blocked, rest: slice.subarray(take) };
}

function convertLegacyBinary(jsonPath, rawPath) {
  mkdirSync(mediaDir, { recursive: true });
  const partial = `${rawPath}.partial`;
  return new Promise((resolve, reject) => {
    const input = createReadStream(jsonPath);
    const output = createWriteStream(partial);
    const marker = Buffer.from('"data":"');
    let pending = Buffer.alloc(0);
    let inData = false;
    let settled = false;
    let finished = false;

    function fail(error) {
      if (settled) {
        return;
      }
      settled = true;
      input.destroy();
      output.destroy();
      rmSync(partial, { force: true });
      reject(error instanceof Error ? error : new Error("Could not read stored file"));
    }

    function succeed() {
      if (settled) {
        return;
      }
      settled = true;
      input.removeAllListeners("error");
      input.destroy();
      renameSync(partial, rawPath);
      resolve(rawPath);
    }

    function pump() {
      if (!inData) {
        const at = pending.indexOf(marker);
        if (at < 0) {
          if (pending.length > marker.length) {
            pending = pending.subarray(pending.length - (marker.length - 1));
          }
          return { done: false, blocked: false };
        }
        inData = true;
        pending = pending.subarray(at + marker.length);
      }
      const decoded = decodeBase64Chunk(pending, output);
      pending = decoded.rest;
      if (decoded.blocked && !decoded.done) {
        input.pause();
        output.once("drain", () => {
          if (!settled && !finished) {
            input.resume();
          }
        });
      }
      return decoded;
    }

    input.on("data", (chunk) => {
      if (settled || finished) {
        return;
      }
      pending = Buffer.concat([pending, chunk]);
      if (!pump().done) {
        return;
      }
      finished = true;
      input.pause();
      output.end();
    });
    input.on("end", () => {
      if (settled || finished) {
        return;
      }
      if (!inData || !pump().done) {
        fail(new Error("Stored file is missing its bytes"));
        return;
      }
      finished = true;
      output.end();
    });
    input.on("error", fail);
    output.on("error", fail);
    output.on("finish", succeed);
  });
}

function ensureRaw(fileId) {
  const raw = rawMediaPath(fileId);
  if (!raw) {
    return Promise.resolve(null);
  }
  if (existsSync(raw)) {
    return Promise.resolve(raw);
  }
  const legacy = legacyBinaryPath(fileId);
  if (!existsSync(legacy)) {
    return Promise.resolve(null);
  }
  const running = mediaJobs.get(raw);
  if (running) {
    return running;
  }
  const job = convertLegacyBinary(legacy, raw).finally(() => {
    mediaJobs.delete(raw);
  });
  mediaJobs.set(raw, job);
  return job;
}

function streamBytes(request, response, filePath, mimeType, name) {
  const size = statSync(filePath).size;
  const headers = {
    "Content-Type": mimeType || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `inline; filename="${contentName(name)}"`,
  };
  const range = request.headers.range;
  if (!range) {
    response.writeHead(200, { ...headers, "Content-Length": size });
    createReadStream(filePath).pipe(response);
    return;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || size === 0) {
    response.writeHead(416, { "Content-Range": `bytes */${size}` });
    response.end();
    return;
  }
  let start = match[1] ? Number(match[1]) : NaN;
  let end = match[2] ? Number(match[2]) : size - 1;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    start = Number.isFinite(suffix) ? Math.max(size - suffix, 0) : NaN;
    end = size - 1;
  } else if (match[2] === "") {
    end = size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= size) {
    response.writeHead(416, { "Content-Range": `bytes */${size}` });
    response.end();
    return;
  }
  end = Math.min(end, size - 1);
  response.writeHead(206, {
    ...headers,
    "Content-Range": `bytes ${start}-${end}/${size}`,
    "Content-Length": end - start + 1,
  });
  createReadStream(filePath, { start, end }).pipe(response);
}

async function serveMedia(request, response) {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const fileId = decodeURIComponent(url.pathname.slice("/media/".length));
    if (!fileId || safeFileId(fileId) !== fileId) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("File not found.");
      return;
    }
    const stored = findFile(fileId) || findAttachment(fileId);
    const clientId = url.searchParams.get("clientId") || "";
    if (!stored || !canSeeStoredFile(stored, clientId)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("File not found.");
      return;
    }
    const raw = await ensureRaw(fileId);
    if (!raw) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("File not found.");
      return;
    }
    streamBytes(request, response, raw, stored.mimeType, stored.name);
  } catch (error) {
    console.log("Media request failed", error);
    if (response.headersSent) {
      response.destroy();
      return;
    }
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Could not open that file.");
  }
}

function handler(request, response) {
  const url = request.url ?? "/";
  if (url.startsWith("/ws")) {
    response.writeHead(426);
    response.end();
    return;
  }
  if (url.startsWith("/media/")) {
    void serveMedia(request, response);
    return;
  }
  const full = filePath(url);
  if (!full) {
    response.writeHead(403);
    response.end();
    return;
  }
  if (existsSync(full) && statSync(full).isFile()) {
    sendFile(response, full);
    return;
  }
  const fallback = join(root, "index.html");
  if (!existsSync(fallback)) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Missing dist/index.html. Run the web build first.");
    return;
  }
  sendFile(response, fallback);
}

function clientIdFromRequest(request) {
  try {
    return new URL(request?.url ?? "/ws", "http://127.0.0.1").searchParams.get("clientId") || "";
  } catch {
    return "";
  }
}

function presenceMessage() {
  return JSON.stringify({
    id: `presence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    topic: "presence",
    type: "snapshot",
    sentAt: new Date().toISOString(),
    payload: {
      peers: [...presence.values()],
    },
  });
}

function broadcastPresence() {
  const data = presenceMessage();
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(data);
    }
  }
}

let directoryTimer = null;
function scheduleDirectory() {
  clearTimeout(directoryTimer);
  directoryTimer = setTimeout(writeDirectory, 40);
}

function writeDirectory() {
  const people = [...presence.values()]
    .filter((peer) => peer.displayName)
    .map((peer) => ({ clientId: peer.clientId, displayName: peer.displayName }));
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(directoryPath, JSON.stringify({ people }));
}

function upsertPeer(clientId, displayName, online, refreshConnectedAt) {
  if (!clientId) {
    return;
  }
  const current = presence.get(clientId);
  const previousName = current?.displayName || "";
  const nextName = typeof displayName === "string" && displayName.trim() ? displayName.trim() : previousName;
  presence.set(clientId, {
    clientId,
    displayName: nextName,
    status: online ? "online" : "offline",
    connectedAt: refreshConnectedAt || !current ? new Date().toISOString() : current.connectedAt,
  });
  if (nextName && nextName !== previousName) {
    scheduleDirectory();
  }
}

function loadDirectory() {
  if (!existsSync(directoryPath)) {
    return;
  }
  try {
    const saved = JSON.parse(readFileSync(directoryPath, "utf8"));
    for (const person of saved.people || []) {
      if (typeof person?.clientId === "string" && typeof person?.displayName === "string") {
        upsertPeer(person.clientId, person.displayName, false, false);
      }
    }
  } catch (error) {
    console.error("Could not read the people directory", error);
  }
}

function rememberAuthor(authorId, author) {
  if (typeof authorId !== "string" || !authorId || typeof author !== "string" || !author.trim()) {
    return;
  }
  if (presence.get(authorId)?.displayName) {
    return;
  }
  upsertPeer(authorId, author, false, false);
}

function seedNamesFromHistory() {
  for (const room of workspace.rooms.rooms || []) {
    for (const message of room.messages || []) {
      rememberAuthor(message.authorId, message.author);
    }
  }
  for (const thread of workspace.direct.threads || []) {
    for (const message of thread.messages || []) {
      rememberAuthor(message.authorId, message.author);
    }
  }
}

function releaseSocket(socket) {
  clients.delete(socket);
  const id = socket.clientId;
  if (!id) {
    return;
  }
  const stillConnected = [...clients].some((client) => client.clientId === id && client.readyState === 1);
  if (stillConnected) {
    return;
  }
  dropClientFromCalls(id);
  abandonTransfers(id);
  const current = presence.get(id);
  if (!current || current.status === "offline") {
    return;
  }
  presence.set(id, { ...current, status: "offline" });
  broadcastPresence();
}

function sendToAudience(audience, data, sender, includeSender = false) {
  for (const client of clients) {
    if (client.readyState !== 1) {
      continue;
    }
    if (client === sender && !includeSender) {
      continue;
    }
    if (audience && !canSeeAudience(audience, client.clientId)) {
      continue;
    }
    client.send(data);
  }
}

function relayFileEvent(envelope, raw, socket) {
  const type = envelope?.type;
  const transferId = envelope?.payload?.transferId;
  if (type === "file-start" || type === "file-chunk" || type === "file-end") {
    if (!transferAudience.has(transferId)) {
      return;
    }
    if ((type === "file-start" || type === "file-chunk") && !transfers.has(transferId)) {
      return;
    }
    const audience = transferAudience.get(transferId);
    if (type === "file-end") {
      transferAudience.delete(transferId);
    }
    sendToAudience(audience, textFrame(raw), socket);
    return;
  }
  if (type === "file-organize") {
    return;
  }
  for (const client of clients) {
    if (client !== socket && client.readyState === 1) {
      client.send(textFrame(raw));
    }
  }
}

function relayOrganize(result) {
  if (!result || result.kind !== "organize") {
    return;
  }
  const data = JSON.stringify({
    id: `organize-${result.file.id}-${result.folderId}`,
    topic: "files",
    type: "file-organize",
    sentAt: new Date().toISOString(),
    payload: { folderId: result.folderId, file: result.file },
  });
  sendToAudience(result.audience, data, null, true);
}

function attachRelay(server) {
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 64 * 1024 * 1024 });
  wss.on("connection", (socket, request) => {
    const clientId = clientIdFromRequest(request);
    socket.clientId = clientId;
    if (clientId) {
      upsertPeer(clientId, "", true, true);
    }
    clients.add(socket);
    socket.send(snapshotMessage(clientId));
    if (clientId) {
      broadcastPresence();
    }
    socket.on("message", (data, isBinary) => {
      if (!isBinary) {
        try {
          const envelope = JSON.parse(data.toString());
          if (envelope?.topic === "presence" && envelope?.type === "hello") {
            const id = envelope.clientId || envelope.payload?.clientId || socket.clientId;
            socket.clientId = id || socket.clientId;
            upsertPeer(id, envelope.payload?.displayName || "", true, false);
            broadcastPresence();
            return;
          }
          if (envelope?.topic === "call") {
            const roomId = typeof envelope.payload?.roomId === "string" ? envelope.payload.roomId : "";
            const room = workspace.rooms.rooms.find((item) => item.id === roomId);
            const actor = envelope.clientId || envelope.payload?.clientId || envelope.payload?.from || socket.clientId || "";
            if (!canAccessRoom(room, actor)) {
              return;
            }
            rememberCall(envelope, socket.clientId || "");
            relayToAccess(room, textFrame(data), socket);
            return;
          }
          if (envelope?.topic === "rooms") {
            const result = rememberWorkspace(envelope, socket.clientId || "");
            relayRoomResult(result, data, socket);
            if (result?.kind && result.kind !== "drop") {
              scheduleSave();
            }
            return;
          }
          if (envelope?.topic === "direct") {
            const result = rememberDirect(envelope, socket.clientId || "");
            relayDirect(result, socket);
            if (result?.kind === "message") {
              scheduleSave();
            }
            return;
          }
          if (envelope?.topic === "files") {
            const result = rememberWorkspace(envelope, socket.clientId || "");
            if (envelope.type === "file-organize") {
              relayOrganize(result);
            } else {
              relayFileEvent(envelope, data, socket);
            }
            if (envelope.type !== "file-start" && envelope.type !== "file-chunk") {
              scheduleSave();
            }
            return;
          }
          if (envelope?.type !== "snapshot") {
            rememberWorkspace(envelope, socket.clientId || "");
          }
        } catch {
          return;
        }
      }
      for (const client of clients) {
        if (client !== socket && client.readyState === 1) {
          client.send(data, { binary: isBinary });
        }
      }
    });
    socket.on("close", () => {
      releaseSocket(socket);
    });
    socket.on("error", () => {
      releaseSocket(socket);
    });
  });
}

function listen(host) {
  const server = createServer(handler);
  attachRelay(server);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      resolve(server);
    });
  });
}

if (!existsSync(join(root, "index.html"))) {
  console.error("Missing dist/index.html. The web script builds it before starting.");
  process.exit(1);
}

loadPersisted();
loadDirectory();
seedNamesFromHistory();

const servers = [];
try {
  servers.push(await listen("127.0.0.1"));
} catch (error) {
  console.error("Could not listen on 127.0.0.1:8082");
  console.error(error);
  process.exit(1);
}
try {
  servers.push(await listen("::1"));
} catch (error) {
  console.error("Could not listen on [::1]:8082");
  console.error(error);
}

setInterval(() => {
  for (const client of clients) {
    if (client.readyState === 1) {
      client.ping();
    }
  }
}, 20000).unref();

console.log("Netcore Workspace");
console.log("http://127.0.0.1:8082");
console.log("ws://127.0.0.1:8082/ws");
