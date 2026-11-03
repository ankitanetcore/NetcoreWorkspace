import type { Room, RoomAccess, RoomMessage } from "@/domain/types";

export function memberIdsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item && !ids.includes(item)) {
      ids.push(item);
    }
  }
  return ids;
}

export function roomAccessFrom(value: unknown): RoomAccess {
  return value === "selected" ? "selected" : "everyone";
}

export function normalizeRoom(room: {
  id: string;
  name: string;
  messages?: RoomMessage[];
  access?: unknown;
  memberIds?: unknown;
  ownerId?: unknown;
}): Room {
  const access = roomAccessFrom(room.access);
  const id = typeof room.id === "string" ? room.id : "";
  const name = typeof room.name === "string" ? room.name : "";
  return {
    id,
    name,
    messages: Array.isArray(room.messages) ? room.messages : [],
    access,
    memberIds: memberIdsFrom(room.memberIds),
    ...(typeof room.ownerId === "string" && room.ownerId ? { ownerId: room.ownerId } : {}),
  };
}

export function canAccessRoom(
  room: { access?: unknown; memberIds?: unknown } | null | undefined,
  clientId: string,
): boolean {
  if (!room) {
    return false;
  }
  if (roomAccessFrom(room.access) !== "selected") {
    return true;
  }
  return Boolean(clientId) && memberIdsFrom(room.memberIds).includes(clientId);
}
