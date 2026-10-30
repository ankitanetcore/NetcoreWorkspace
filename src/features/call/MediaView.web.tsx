import { useEffect, useRef } from "react";
import { createElement } from "react";
import { View } from "react-native";

export function MediaView({
  stream,
  silent,
  fit = "cover",
}: {
  stream: unknown;
  silent: boolean;
  fit?: "contain" | "cover";
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const media = stream instanceof MediaStream ? stream : null;
  const trackKey = media?.getTracks().map((track) => track.id).join(",") ?? "";

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    node.srcObject = media;
    node.muted = silent;
    if (!silent) {
      console.log("remote stream attachment", {
        tracks: media?.getTracks().map((track) => `${track.kind}:${track.readyState}`) ?? [],
      });
    }
    if (!media) {
      return;
    }
    void node.play().catch((error: unknown) => {
      console.log(silent ? "local video play failed" : "remote video play failed", error);
      if (silent) {
        return;
      }
      const retry = () => {
        void node.play().catch(() => undefined);
      };
      document.addEventListener("pointerdown", retry, { once: true });
    });
  }, [media, silent, trackKey]);

  return (
    <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}>
      {createElement("video", {
        ref,
        autoPlay: true,
        playsInline: true,
        muted: silent,
        style: {
          width: "100%",
          height: "100%",
          objectFit: fit,
          backgroundColor: "#243044",
        },
      })}
    </View>
  );
}
