import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

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
  if (!person) {
    return null;
  }
  const speaking = speaker.speaking && person.id === speaker.id;
  const showVideo = person.stream != null && !person.cameraOff;
  const label = person.self ? "You" : person.name;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={speaking ? `${label} is speaking. Return to the call` : `Return to the call with ${label}`}
      onPress={onRestore}
      style={({ pressed }) => [
        styles.card,
        { bottom: desktop ? 20 : Math.max(bottomInset, 10) + 64 },
        webPointer,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.stage}>
        {showVideo ? <MediaView stream={person.stream} silent /> : null}
        {showVideo ? null : (
          <View style={styles.avatar}>
            <Text style={styles.initials}>{initialsFor(label)}</Text>
          </View>
        )}
        <View style={styles.caption}>
          <View style={[styles.dot, speaking && styles.dotLive]} />
          <Text style={styles.captionText} numberOfLines={1}>
            {speaking ? `${label} is speaking` : label}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    right: 16,
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
