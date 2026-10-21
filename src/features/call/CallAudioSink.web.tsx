import { useEffect, useRef } from "react";
import { createElement } from "react";
import { View } from "react-native";

export function CallAudioSink({ participants }: { participants: { id: string; stream: unknown }[] }) {
  return (
    <View pointerEvents="none" style={{ width: 0, height: 0, overflow: "hidden" }}>
      {participants.map((person) => (
        <RemoteAudio key={person.id} stream={person.stream} />
      ))}
    </View>
  );
}

function RemoteAudio({ stream }: { stream: unknown }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const media = stream instanceof MediaStream ? stream : null;
  const trackKey = media?.getAudioTracks().map((track) => `${track.id}:${track.enabled}`).join(",") ?? "";

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    node.srcObject = media;
    if (!media) {
      return;
    }
    void node.play().catch(() => undefined);
  }, [media, trackKey]);

  return createElement("audio", { ref, autoPlay: true });
}
