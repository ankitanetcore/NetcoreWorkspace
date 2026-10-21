import { getTransport } from "@/transport";

export function announceRoomCall(roomId: string, name: string, clientId: string) {
  getTransport().publish({
    id: `call-started-${roomId}-${Date.now()}`,
    topic: "call",
    type: "call-started",
    sentAt: new Date().toISOString(),
    clientId,
    payload: { roomId, clientId, name },
  });
}
