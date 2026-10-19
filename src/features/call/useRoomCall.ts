import { router } from "expo-router";
import { useState } from "react";

import type { RoomCallControls } from "@/features/call/roomCallTypes";

export function useRoomCall(_roomId: string): RoomCallControls {
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  return {
    muted,
    cameraOff,
    localStream: null,
    participants: [],
    toggleMute() {
      setMuted((value) => !value);
    },
    toggleCamera() {
      setCameraOff((value) => !value);
    },
    leave() {
      router.back();
    },
  };
}
