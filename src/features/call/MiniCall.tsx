import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from "react-native";

import { ArrowUpLeftIcon } from "@/components/ChatIcons";

import { MediaView } from "@/features/call/MediaView";
import type { RoomCallControls } from "@/features/call/roomCallTypes";
import { initialsFor, tilesForCall } from "@/features/call/tiles";
import { useActiveSpeaker } from "@/features/call/useActiveSpeaker";
import { useSession } from "@/session/Session";
import { webPointer } from "@/theme/pressable";
import { colors, font, layout } from "@/theme/tokens";

export function MiniCall({
  call,
  bottomInset,
  onRestore,
}: {
  call: RoomCallControls;
  bottomInset: number;
  onRestore: () => void;
}) {
  const { name } = useSession();
  const { width } = useWindowDimensions();
  const desktop = width >= layout.desktopMinWidth;
  const tiles = tilesForCall(name, call);
  const speaker = useActiveSpeaker(tiles);
  const person = tiles.find((tile) => tile.id === speaker.id) ?? tiles.find((tile) => !tile.self) ?? tiles[0];
  const cardRef = useRef<View>(null);
  const [corner, setCorner] = useState<MiniCorner>("bottom-right");
  const [drag, setDrag] = useState<{ left: number; top: number } | null>(null);
  const bottom = desktop ? 20 : Math.max(bottomInset, 10) + 64;

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }
    const cardNode = cardRef.current as unknown as HTMLElement | null;
    const frameNode = cardNode?.parentElement ?? null;
    if (!cardNode || !frameNode) {
      return;
    }
    const card: HTMLElement = cardNode;
    const frame: HTMLElement = frameNode;
    let moved = false;
    let suppressClick = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;

    function onDown(event: PointerEvent) {
      if (event.button !== 0) {
        return;
      }
      const frameBox = frame.getBoundingClientRect();
      const box = card.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      originLeft = box.left - frameBox.left;
      originTop = box.top - frameBox.top;
      moved = false;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    }

    function onMove(event: PointerEvent) {
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 5) {
        return;
      }
      moved = true;
      const frameBox = frame.getBoundingClientRect();
      const box = card.getBoundingClientRect();
      const left = Math.min(Math.max(8, originLeft + dx), Math.max(8, frameBox.width - box.width - 8));
      const top = Math.min(Math.max(8, originTop + dy), Math.max(8, frameBox.height - box.height - 8));
      setDrag({ left, top });
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!moved) {
        setDrag(null);
        return;
      }
      suppressClick = true;
      const frameBox = frame.getBoundingClientRect();
      const box = card.getBoundingClientRect();
      setCorner(
        nearestMiniCorner(
          box.left - frameBox.left + box.width / 2,
          box.top - frameBox.top + box.height / 2,
          frameBox.width,
          frameBox.height,
        ),
      );
      setDrag(null);
    }

    function onClick(event: MouseEvent) {
      if (!suppressClick) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    }

    card.addEventListener("pointerdown", onDown);
    card.addEventListener("click", onClick, true);
    return () => {
      card.removeEventListener("pointerdown", onDown);
      card.removeEventListener("click", onClick, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [person?.id]);

  if (!person) {
    return null;
  }
  const speaking = speaker.speaking && person.id === speaker.id;
  const showVideo = person.stream != null && !person.cameraOff;
  const label = person.self ? "You" : person.name;

  return (
    <View
      ref={cardRef}
      style={[
        styles.card,
        drag ? { top: drag.top, left: drag.left } : miniPlacement(corner, bottom),
        Platform.OS === "web" ? ({ cursor: drag ? "grabbing" : "grab" } as unknown as ViewStyle) : null,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={speaking ? `${label} is speaking. Return to the call` : `Return to the call with ${label}`}
        onPress={onRestore}
        style={({ pressed }) => [styles.stage, webPointer, pressed && styles.pressed]}
      >
        {showVideo ? <MediaView stream={person.stream} silent /> : null}
        {showVideo ? null : (
          <View style={styles.avatar}>
            <Text style={styles.initials}>{initialsFor(label)}</Text>
          </View>
        )}
        <View style={styles.caption}>
          <View style={[styles.dot, speaking && styles.dotLive]} />
          <Text style={styles.captionText} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Maximize call"
        onPress={onRestore}
        style={({ pressed }) => [styles.expand, webPointer, pressed && styles.pressed]}
      >
        <ArrowUpLeftIcon size={16} color={colors.sidebarText} strokeWidth={1.75} />
      </Pressable>
    </View>
  );
}

type MiniCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

function miniPlacement(corner: MiniCorner, bottom: number): ViewStyle {
  switch (corner) {
    case "top-left":
      return { top: 16, left: 16 };
    case "top-right":
      return { top: 16, right: 16 };
    case "bottom-left":
      return { bottom, left: 16 };
    default:
      return { bottom, right: 16 };
  }
}

function nearestMiniCorner(x: number, y: number, width: number, height: number): MiniCorner {
  const top = y < height / 2;
  const left = x < width / 2;
  if (top && left) {
    return "top-left";
  }
  if (top) {
    return "top-right";
  }
  if (left) {
    return "bottom-left";
  }
  return "bottom-right";
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    width: 196,
    height: 124,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: colors.navy,
    shadowColor: "#142033",
    shadowOpacity: 0.32,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.navyRaised,
  },
  expand: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20, 32, 51, 0.72)",
    zIndex: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.burgundy,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    ...font.ui,
    color: colors.youText,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "600",
  },
  caption: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(26, 39, 68, 0.82)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.sidebarMuted,
  },
  dotLive: {
    backgroundColor: colors.onlineOnNavy,
  },
  captionText: {
    ...font.ui,
    flex: 1,
    color: colors.sidebarText,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.88,
  },
});
