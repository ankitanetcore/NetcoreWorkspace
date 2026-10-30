import { useEffect, useRef, useState } from "react";

import { stageCamera } from "@/features/call/cameraStage";

export function useLobbyCamera(active: boolean) {
  const streamRef = useRef<MediaStream | null>(null);
  const handedOff = useRef(false);
  const [displayStream, setDisplayStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (!active) {
      return;
    }
    let cancelled = false;
    handedOff.current = false;
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((stream) => {
        if (cancelled || handedOff.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setDisplayStream(stream);
      })
      .catch((error: unknown) => {
        console.log("getUserMedia failed", error);
      });
    return () => {
      cancelled = true;
      if (handedOff.current) {
        return;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [active]);

  function handOff() {
    const local = streamRef.current;
    handedOff.current = true;
    if (!local) {
      return;
    }
    stageCamera({ stream: local });
    streamRef.current = null;
  }

  return { displayStream, handOff };
}
