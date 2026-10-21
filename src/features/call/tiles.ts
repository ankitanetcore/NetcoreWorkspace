import type { RoomCallControls } from "@/features/call/roomCallTypes";

export interface CallTile {
  id: string;
  name: string;
  muted: boolean;
  cameraOff: boolean;
  stream: unknown;
  self: boolean;
}

export function tilesForCall(name: string, call: RoomCallControls): CallTile[] {
  return [
    ...call.participants.map((person) => ({ ...person, self: false })),
    {
      id: "self",
      name: name || "You",
      muted: call.muted,
      cameraOff: call.cameraOff,
      stream: call.localStream,
      self: true,
    },
  ];
}

export function initialsFor(name: string) {
  const letters = name
    .replace(" (you)", "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
  return letters || "?";
}
