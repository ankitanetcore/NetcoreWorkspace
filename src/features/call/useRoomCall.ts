import { useRef, useState } from "react";

import type { RoomCallControls } from "@/features/call/roomCallTypes";

export function useRoomCall(roomId: string | null, onEnded?: () => void): RoomCallControls | null {
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  if (!roomId) {
    return null;
  }

  return {
    muted,
    cameraOff,
    sharing: false,
    localStream: null,
    screenStream: null,
    participants: [],
    toggleMute() {
      setMuted((value) => !value);
    },
    toggleCamera() {
      setCameraOff((value) => !value);
    },
    toggleScreenShare() {},
    leave() {
      onEndedRef.current?.();
    },
  };
}
