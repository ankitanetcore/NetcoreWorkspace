import { router } from "expo-router";

import { getTransport } from "@/transport";

export function startRoomCall(roomId: string, name: string, clientId: string) {
  getTransport().publish({
    id: `call-started-${roomId}-${Date.now()}`,
    topic: "call",
    type: "call-started",
    sentAt: new Date().toISOString(),
    clientId,
    payload: { roomId, clientId, name },
  });
  router.push({ pathname: "/call", params: { room: roomId } });
}

export function joinRoomCall(roomId: string) {
  router.push({ pathname: "/call", params: { room: roomId } });
}
