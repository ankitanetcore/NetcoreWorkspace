import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { MediaView } from "@/features/call/MediaView";
import { initialsFor } from "@/features/call/tiles";
import { useLobbyCamera } from "@/features/call/useLobbyCamera";
import { useSession } from "@/session/Session";
import { webPointer } from "@/theme/pressable";
import { colors, font, text } from "@/theme/tokens";

export interface CallEntry {
  roomId: string;
  roomName: string;
  mode: "start" | "join";
  startedBy?: string;
  startedName?: string;
}

export function CallLobby({ entry, onCancel, onConfirm }: { entry: CallEntry; onCancel: () => void; onConfirm: () => void }) {
  const { name } = useSession();
  const camera = useLobbyCamera(true);
  const joining = entry.mode === "join";
  const action = joining ? "Join call" : "Start call";

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Text style={[text.title, font.brand]}>{joining ? "Join the call" : "Start the call"}</Text>
          <Text style={[text.meta, styles.room]}>{entry.roomName}</Text>
          <View style={styles.preview}>
            {camera.displayStream ? <MediaView stream={camera.displayStream} silent fit="cover" /> : null}
            {camera.displayStream ? null : (
              <View style={styles.avatar}>
                <Text style={styles.initials}>{initialsFor(name)}</Text>
              </View>
            )}
          </View>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Not now"
              onPress={onCancel}
              style={({ pressed }) => [styles.quiet, webPointer, pressed && styles.pressed]}
            >
              <Text style={styles.quietLabel}>Not now</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${action} in ${entry.roomName}`}
              onPress={() => {
                camera.handOff();
                onConfirm();
              }}
              style={({ pressed }) => [styles.join, webPointer, pressed && styles.pressed]}
            >
              <Text style={styles.joinLabel}>{action}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(20, 32, 51, 0.46)",
  },
  card: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 18,
    backgroundColor: colors.surface,
    padding: 22,
    gap: 14,
  },
  room: {
    marginTop: -8,
  },
  preview: {
    height: 248,
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.navy,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.burgundy,
  },
  initials: {
    color: colors.youText,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  quiet: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  quietLabel: {
    ...font.ui,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  join: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.burgundy,
  },
  joinLabel: {
    ...font.ui,
    color: colors.youText,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.72,
  },
});
