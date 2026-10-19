import { canAccessRoom, normalizeRoom } from "@/domain/membership";
import type { RoomMessage, WorkspaceFile } from "@/domain/types";
import { fileDownloadUrl, forgetFileDownload, setFileDownload } from "@/features/files/downloads";
import { reportTransferFailure } from "@/features/files/transferNotice";
import { currentClientId } from "@/session/currentIdentity";
import { loadStoredIdentity } from "@/session/deviceStorage";
import { bindPresenceSender } from "@/session/presence";
import { applyEnvelope } from "@/transport/applyEnvelope";
import { setConnectionPhase } from "@/transport/connectionPhase";
import type {
  Transport,
  TransportEnvelope,
  TransportListener,
  TransportSnapshots,
  TransportTopic,
} from "@/transport/types";

const transferTypes = new Set(["file-start", "file-chunk", "file-end"]);

interface FileStart {
  transferId?: string;
  folderId?: string;
  fileId?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  chunkCount?: number;
  editable?: boolean;
  body?: string;
  detail?: string;
}

interface FileChunk {
  transferId?: string;
  index?: number;
  data?: string;
}

interface IncomingTransfer {
  folderId: string;
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
  chunkCount: number;
  editable: boolean;
  body: string;
  detail: string;
  chunks: Array<Uint8Array | undefined>;
}

function socketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${protocol}//${window.location.host}/ws`);
  const clientId = currentClientId();
  if (clientId) {
    url.searchParams.set("clientId", clientId);
  }
  return url.toString();
}

function mediaUrl(fileId: string) {
  const clientId = currentClientId();
  const params = new URLSearchParams();
  if (clientId) {
    params.set("clientId", clientId);
  }
  const query = params.toString();
  return `/media/${encodeURIComponent(fileId)}${query ? `?${query}` : ""}`;
}

function rememberStoredFile(fileId: string | undefined) {
  if (!fileId || fileDownloadUrl(fileId)) {
    return;
  }
  setFileDownload(fileId, mediaUrl(fileId));
}

function withoutMine(envelope: TransportEnvelope): TransportEnvelope {
  if (envelope.topic !== "rooms" || envelope.type !== "message") {
    return envelope;
  }
  const payload = envelope.payload as { roomId?: string; message?: RoomMessage };
  if (!payload.message) {
    return envelope;
  }
  const { mine: _mine, ...message } = payload.message;
  return { ...envelope, payload: { roomId: payload.roomId, message } };
}

function bytesFromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function rememberTextDownload(file: WorkspaceFile | undefined, replace: boolean) {
  if (!file?.editable || typeof URL === "undefined" || (!replace && fileDownloadUrl(file.id))) {
    return;
  }
  setFileDownload(
    file.id,
    URL.createObjectURL(new Blob([file.body], { type: file.mimeType || "text/plain" })),
  );
}

interface ActiveCall {
  roomId?: string;
  active?: boolean;
  startedBy?: string;
  startedName?: string;
  participantIds?: string[];
}

interface WorkspaceSnapshot {
  rooms?: TransportSnapshots["rooms"];
  direct?: TransportSnapshots["direct"];
  files?: TransportSnapshots["files"];
  calls?: ActiveCall[];
}

function readActiveCall(call: ActiveCall) {
  const participantIds = (call.participantIds ?? []).filter((id): id is string => typeof id === "string" && id.length > 0);
  if (!call.roomId || !call.startedBy) {
    return null;
  }
  return {
    roomId: call.roomId,
    startedBy: call.startedBy,
    startedName: call.startedName?.trim() || "Someone",
    participantIds,
  };
}

export function createWebSocketTransport(snapshots: TransportSnapshots): Transport {
  const subscribers = new Map<TransportTopic, Set<TransportListener>>();
  const incoming = new Map<string, IncomingTransfer>();
  const outgoing = new Map<string, { fileId: string; name: string }>();
  const waiting: TransportEnvelope[] = [];
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = 1000;
  let everOpen = false;
  let pendingRestore = false;
  let hydrated = false;
  let presenceSeen = false;
  const activeCalls = new Map<string, NonNullable<ReturnType<typeof readActiveCall>>>();

  function rosterEnvelope(): TransportEnvelope {
    return {
      id: `call-roster-${Date.now()}`,
      topic: "call",
      type: "roster",
      sentAt: new Date().toISOString(),
      payload: { calls: [...activeCalls.values()] },
    };
  }

  function rememberCallStatus(call: NonNullable<ReturnType<typeof readActiveCall>> | null, roomId: string) {
    if (!call) {
      activeCalls.delete(roomId);
      return;
    }
    activeCalls.set(roomId, call);
  }

  function emit(envelope: TransportEnvelope) {
    const listeners = subscribers.get(envelope.topic);
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      try {
        listener(envelope);
      } catch (error) {
        console.log("WebSocket listener failed", error);
      }
    }
  }

  function identified(envelope: TransportEnvelope): TransportEnvelope {
    const clientId = loadStoredIdentity()?.clientId;
    if (!clientId || envelope.clientId) {
      return envelope;
    }
    return { ...envelope, clientId };
  }

  function sendPresence(displayName: string) {
    const identity = loadStoredIdentity();
    if (!identity || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(
      JSON.stringify({
        id: `presence-${identity.clientId}-${Date.now()}`,
        topic: "presence",
        type: "hello",
        sentAt: new Date().toISOString(),
        clientId: identity.clientId,
        payload: { clientId: identity.clientId, displayName },
      }),
    );
  }

  function enqueue(envelope: TransportEnvelope) {
    const index = waiting.findIndex((item) => item.id === envelope.id);
    if (index >= 0) {
      waiting[index] = envelope;
      return;
    }
    waiting.push(envelope);
  }

  function send(envelope: TransportEnvelope) {
    const data = JSON.stringify(withoutMine(identified(envelope)));
    if (hydrated && socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(data);
        return true;
      } catch (error) {
        console.log("WebSocket send failed", error);
      }
    }
    return false;
  }

  function findFile(fileId: string) {
    for (const folder of snapshots.files.folders) {
      const file = folder.files.find((item) => item.id === fileId);
      if (file) {
        return file;
      }
    }
    return undefined;
  }

  function finishTransfer(record: IncomingTransfer) {
    const parts = record.chunks.filter((chunk): chunk is Uint8Array => chunk instanceof Uint8Array);
    const blob = new Blob(parts as BlobPart[], { type: record.mimeType });
    setFileDownload(record.fileId, URL.createObjectURL(blob));
    if (!record.folderId || findFile(record.fileId)) {
      emit({
        id: `ready-${record.fileId}`,
        topic: "files",
        type: "ready",
        sentAt: new Date().toISOString(),
        payload: { fileId: record.fileId },
      });
      return;
    }
    const file: WorkspaceFile = {
      id: record.fileId,
      name: record.name,
      detail: record.detail,
      body: record.body,
      editable: record.editable,
      mimeType: record.mimeType,
      size: record.size,
    };
    applyEnvelope(snapshots, {
      id: record.fileId,
      topic: "files",
      type: "create",
      sentAt: new Date().toISOString(),
      payload: { folderId: record.folderId, file },
    });
    emit({
      id: `ready-${record.fileId}`,
      topic: "files",
      type: "ready",
      sentAt: new Date().toISOString(),
      payload: { fileId: record.fileId },
    });
  }

  function receiveTransfer(envelope: TransportEnvelope) {
    if (envelope.type === "file-start") {
      const payload = envelope.payload as FileStart;
      if (!payload.transferId || !payload.fileId || !payload.chunkCount) {
        return;
      }
      incoming.set(payload.transferId, {
        folderId: payload.folderId || "",
        fileId: payload.fileId,
        name: payload.name || "file",
        mimeType: payload.mimeType || "application/octet-stream",
        size: payload.size ?? 0,
        chunkCount: payload.chunkCount,
        editable: Boolean(payload.editable),
        body: payload.body ?? "",
        detail: payload.detail || "Uploaded",
        chunks: new Array(payload.chunkCount),
      });
      return;
    }
    if (envelope.type === "file-chunk") {
      const payload = envelope.payload as FileChunk;
      const record = payload.transferId ? incoming.get(payload.transferId) : undefined;
      if (!record || typeof payload.index !== "number" || typeof payload.data !== "string") {
        return;
      }
      record.chunks[payload.index] = bytesFromBase64(payload.data);
      return;
    }
    if (envelope.type === "file-end") {
      const payload = envelope.payload as { transferId?: string };
      const record = payload.transferId ? incoming.get(payload.transferId) : undefined;
      if (!record) {
        return;
      }
      incoming.delete(payload.transferId as string);
      finishTransfer(record);
    }
  }

  function applySnapshot(payload: WorkspaceSnapshot) {
    if (payload.rooms) {
      const clientId = currentClientId();
      snapshots.rooms = {
        rooms: (payload.rooms.rooms ?? [])
          .map((room) => normalizeRoom(room))
          .filter((room) => canAccessRoom(room, clientId)),
      };
    }
    if (payload.direct) {
      const clientId = currentClientId();
      snapshots.direct = {
        threads: (payload.direct.threads ?? [])
          .filter((thread) => thread.participantIds?.includes(clientId))
          .map((thread) => ({
            id: thread.id,
            participantIds: [...thread.participantIds],
            messages: thread.messages.map((message) => ({ ...message, mine: undefined })),
          })),
      };
    }
    if (payload.files) {
      snapshots.files = payload.files;
    }
    for (const folder of snapshots.files.folders) {
      for (const file of folder.files) {
        if (file.editable) {
          rememberTextDownload(file, false);
        } else {
          rememberStoredFile(file.id);
        }
      }
    }
    for (const room of snapshots.rooms.rooms) {
      for (const message of room.messages) {
        rememberStoredFile(message.file?.fileId);
      }
    }
    for (const thread of snapshots.direct.threads) {
      for (const message of thread.messages) {
        rememberStoredFile(message.file?.fileId);
      }
    }
    if (Array.isArray(payload.calls)) {
      const visible = new Set(snapshots.rooms.rooms.map((room) => room.id));
      activeCalls.clear();
      for (const call of payload.calls) {
        const next = readActiveCall(call);
        if (next && visible.has(next.roomId)) {
          activeCalls.set(next.roomId, next);
        }
      }
    }
    const sentAt = new Date().toISOString();
    emit({ id: `snapshot-rooms-${sentAt}`, topic: "rooms", type: "snapshot", sentAt, payload: {} });
    emit({ id: `snapshot-direct-${sentAt}`, topic: "direct", type: "snapshot", sentAt, payload: {} });
    emit({ id: `snapshot-files-${sentAt}`, topic: "files", type: "snapshot", sentAt, payload: {} });
    emit(rosterEnvelope());
  }

  function deletedFileIds(envelope: TransportEnvelope) {
    if (envelope.topic !== "files") {
      return [];
    }
    if (envelope.type === "file-delete") {
      const fileId = (envelope.payload as { fileId?: string }).fileId;
      return fileId ? [fileId] : [];
    }
    if (envelope.type === "folder-delete") {
      const folderId = (envelope.payload as { folderId?: string }).folderId;
      return (
        snapshots.files.folders.find((folder) => folder.id === folderId)?.files.map((file) => file.id) ?? []
      );
    }
    return [];
  }

  function receive(raw: string) {
    let envelope: TransportEnvelope;
    try {
      envelope = JSON.parse(raw) as TransportEnvelope;
    } catch {
      return;
    }
    if (!envelope || typeof envelope.topic !== "string" || typeof envelope.type !== "string") {
      return;
    }
    if (envelope.topic === "presence") {
      applyEnvelope(snapshots, envelope);
      presenceSeen = true;
      emit(envelope);
      return;
    }
    if (envelope.type === "snapshot") {
      try {
        applySnapshot(envelope.payload as WorkspaceSnapshot);
        hydrated = true;
        if (pendingRestore) {
          pendingRestore = false;
          console.log("Workspace snapshot restored");
        }
        const queued = waiting.splice(0, waiting.length);
        for (const item of queued) {
          commit(item);
        }
      } catch (error) {
        console.log("Workspace snapshot failed", error);
      }
      return;
    }
    if (envelope.topic === "files" && transferTypes.has(envelope.type)) {
      receiveTransfer(envelope);
      return;
    }
    if (envelope.topic === "call" && envelope.type === "status") {
      const payload = envelope.payload as ActiveCall;
      const roomId = payload?.roomId;
      if (roomId) {
        const room = snapshots.rooms.rooms.find((item) => item.id === roomId);
        const visible = !payload.active || canAccessRoom(room, currentClientId());
        if (visible) {
          rememberCallStatus(payload.active ? readActiveCall(payload) : null, roomId);
          emit(envelope);
        }
      }
      return;
    }
    const removed = deletedFileIds(envelope);
    applyEnvelope(snapshots, envelope);
    for (const fileId of removed) {
      if (!referencedByChat(fileId)) {
        forgetFileDownload(fileId);
      }
    }
    if (envelope.topic === "files" && envelope.type === "create") {
      rememberTextDownload((envelope.payload as { file?: WorkspaceFile }).file, false);
    }
    if (envelope.topic === "files" && envelope.type === "update") {
      const fileId = (envelope.payload as { fileId?: string }).fileId;
      rememberTextDownload(fileId ? findFile(fileId) : undefined, true);
    }
    emit(envelope);
  }

  function referencedByChat(fileId: string) {
    return (
      snapshots.rooms.rooms.some((room) => room.messages.some((message) => message.file?.fileId === fileId)) ||
      snapshots.direct.threads.some((thread) => thread.messages.some((message) => message.file?.fileId === fileId))
    );
  }

  function applyAndEmit(envelope: TransportEnvelope) {
    const removed = deletedFileIds(envelope);
    applyEnvelope(snapshots, envelope);
    for (const fileId of removed) {
      if (!referencedByChat(fileId)) {
        forgetFileDownload(fileId);
      }
    }
    if (envelope.topic === "files" && envelope.type === "create") {
      rememberTextDownload((envelope.payload as { file?: WorkspaceFile }).file, false);
    }
    if (envelope.topic === "files" && envelope.type === "update") {
      const fileId = (envelope.payload as { fileId?: string }).fileId;
      rememberTextDownload(fileId ? findFile(fileId) : undefined, true);
    }
    emit(envelope);
  }

  function filePayload(envelope: TransportEnvelope) {
    return envelope.payload as { file?: { id?: string }; fileId?: string; transferId?: string; name?: string };
  }

  function dropQueuedFile(fileId: string) {
    for (let index = waiting.length - 1; index >= 0; index -= 1) {
      const envelope = waiting[index];
      if (envelope.topic !== "files") {
        continue;
      }
      const payload = filePayload(envelope);
      if (payload.file?.id === fileId || payload.fileId === fileId) {
        waiting.splice(index, 1);
      }
    }
  }

  function fileDeleteEnvelope(fileId: string): TransportEnvelope {
    return {
      id: `delete-file-${fileId}`,
      topic: "files",
      type: "file-delete",
      sentAt: new Date().toISOString(),
      payload: { fileId },
    };
  }

  function failOutgoing(transferId: string) {
    const record = outgoing.get(transferId);
    if (!record) {
      return;
    }
    outgoing.delete(transferId);
    const createStillQueued = waiting.some((envelope) => filePayload(envelope).file?.id === record.fileId);
    dropQueuedFile(record.fileId);
    const removal = fileDeleteEnvelope(record.fileId);
    if (!createStillQueued) {
      enqueue(removal);
    }
    applyAndEmit(removal);
    reportTransferFailure(record.name);
  }

  function rememberOutgoing(envelope: TransportEnvelope, sent: boolean) {
    if (envelope.topic !== "files" || !transferTypes.has(envelope.type)) {
      return;
    }
    const payload = filePayload(envelope);
    if (envelope.type === "file-start" && payload.transferId && payload.fileId) {
      outgoing.set(payload.transferId, { fileId: payload.fileId, name: payload.name || "file" });
      if (!sent) {
        failOutgoing(payload.transferId);
      }
      return;
    }
    if (envelope.type === "file-end" && payload.transferId && sent) {
      outgoing.delete(payload.transferId);
      return;
    }
    if (!sent && payload.transferId) {
      failOutgoing(payload.transferId);
    }
  }

  function failInterruptedTransfers() {
    for (const transferId of [...outgoing.keys()]) {
      failOutgoing(transferId);
    }
    for (const record of incoming.values()) {
      reportTransferFailure(record.name);
    }
    incoming.clear();
    for (let index = waiting.length - 1; index >= 0; index -= 1) {
      const envelope = waiting[index];
      if (envelope.topic === "call" || (envelope.topic === "files" && transferTypes.has(envelope.type))) {
        const name = envelope.topic === "files" ? filePayload(envelope).name : "";
        waiting.splice(index, 1);
        if (name) {
          reportTransferFailure(name);
        }
      }
    }
  }

  function commit(envelope: TransportEnvelope) {
    if (envelope.topic === "call") {
      send(envelope);
      return;
    }
    if (envelope.topic === "files" && transferTypes.has(envelope.type)) {
      rememberOutgoing(envelope, send(envelope));
      return;
    }
    applyAndEmit(envelope);
    if (!send(envelope)) {
      enqueue(envelope);
    }
  }

  function publishPhase() {
    if (socket?.readyState === WebSocket.OPEN) {
      setConnectionPhase("connected");
      return;
    }
    if (everOpen) {
      setConnectionPhase("reconnecting");
      return;
    }
    if (socket?.readyState === WebSocket.CONNECTING || reconnectTimer) {
      setConnectionPhase("connecting");
      return;
    }
    setConnectionPhase("disconnected");
  }

  function scheduleReconnect(code?: number) {
    if (reconnectTimer) {
      return;
    }
    const delay = retryDelay;
    retryDelay = Math.min(retryDelay * 2, 5000);
    const detail = typeof code === "number" ? ` (${code})` : "";
    console.log(`WebSocket disconnected${detail}. Retrying in ${delay / 1000}s`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
    publishPhase();
  }

  function connect() {
    hydrated = false;
    let next: WebSocket;
    try {
      next = new WebSocket(socketUrl());
    } catch (error) {
      console.log("WebSocket error", error);
      scheduleReconnect();
      return;
    }
    socket = next;
    publishPhase();
    next.addEventListener("open", () => {
      if (socket !== next) {
        return;
      }
      everOpen = true;
      retryDelay = 1000;
      console.log("WebSocket connected");
      publishPhase();
      const identity = loadStoredIdentity();
      if (identity) {
        sendPresence(identity.displayName);
      }
    });
    next.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }
      try {
        receive(event.data);
      } catch (error) {
        console.log("WebSocket message failed", error);
      }
    });
    next.addEventListener("error", () => {
      console.log("WebSocket error");
    });
    next.addEventListener("close", (event) => {
      if (socket !== next) {
        return;
      }
      socket = null;
      hydrated = false;
      if (everOpen) {
        pendingRestore = true;
      }
      try {
        failInterruptedTransfers();
      } catch (error) {
        console.log("File transfer failed", error);
      }
      scheduleReconnect(event.code);
    });
  }

  bindPresenceSender(sendPresence);
  connect();

  return {
    kind: "websocket",
    snapshot(topic) {
      return snapshots[topic];
    },
    publish(envelope) {
      try {
        if (envelope.topic === "call" || (envelope.topic === "files" && transferTypes.has(envelope.type))) {
          commit(envelope);
          return;
        }
        if (!hydrated || socket?.readyState !== WebSocket.OPEN) {
          applyAndEmit(envelope);
          enqueue(envelope);
          return;
        }
        commit(envelope);
      } catch (error) {
        console.log("WebSocket publish failed", error);
      }
    },
    subscribe(topic, listener) {
      const listeners = subscribers.get(topic) ?? new Set<TransportListener>();
      listeners.add(listener);
      subscribers.set(topic, listeners);
      if (hydrated && (topic === "rooms" || topic === "files" || topic === "direct")) {
        listener({
          id: `catchup-${topic}`,
          topic,
          type: "snapshot",
          sentAt: new Date().toISOString(),
          payload: {},
        });
      }
      if (hydrated && topic === "call") {
        listener(rosterEnvelope());
      }
      if (topic === "presence" && presenceSeen) {
        listener({
          id: "catchup-presence",
          topic,
          type: "snapshot",
          sentAt: new Date().toISOString(),
          payload: {},
        });
      }
      return () => {
        listeners.delete(listener);
        if (reconnectTimer && listeners.size === 0 && subscribers.size === 0) {
          clearTimeout(reconnectTimer);
        }
      };
    },
  };
}
