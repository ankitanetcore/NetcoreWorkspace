export type RoomId = string;

export interface FileAudience {
  kind: "room" | "direct";
  roomId?: string;
  participantIds?: string[];
}

export interface SharedFileRef {
  fileId: string;
  name: string;
  folderId: string;
  mimeType?: string;
  size?: number;
}

export interface RoomMessage {
  id: string;
  author: string;
  authorId?: string;
  time: string;
  sentAt?: string;
  body: string;
  format?: "markdown";
  file?: SharedFileRef;
  mine?: boolean;
}

export type RoomAccess = "everyone" | "selected";

export interface Room {
  id: RoomId;
  name: string;
  messages: RoomMessage[];
  access: RoomAccess;
  memberIds: string[];
}

export interface RoomsSnapshot {
  rooms: Room[];
}

export interface DirectThread {
  id: string;
  participantIds: string[];
  messages: RoomMessage[];
}

export interface DirectSnapshot {
  threads: DirectThread[];
}

export interface WorkspaceFile {
  id: string;
  name: string;
  detail: string;
  body: string;
  editable?: boolean;
  mimeType?: string;
  size?: number;
  clientId?: string;
  audience?: FileAudience;
}

export interface WorkspaceFolder {
  id: string;
  name: string;
  files: WorkspaceFile[];
}

export interface FilesSnapshot {
  folders: WorkspaceFolder[];
}

export interface Participant {
  id: string;
  name: string;
  initials: string;
  you?: boolean;
}

export interface CallSnapshot {
  participants: Participant[];
}

export interface PresencePeer {
  clientId: string;
  displayName: string;
  status: "online" | "offline";
  connectedAt: string;
}

export interface PresenceSnapshot {
  peers: PresencePeer[];
}
