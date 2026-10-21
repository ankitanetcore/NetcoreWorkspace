import { useEffect, useRef } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { GeometricIcon } from "@/components/GeometricIcon";
import type { IncomingCall } from "@/features/call/CallSession";
import { startRingtone, stopRingtone } from "@/features/call/ringtone";
import { webPointer } from "@/theme/pressable";
import { colors, font, text } from "@/theme/tokens";

export function IncomingCallNotice({
  notice,
  confirm,
  ringing,
  topInset,
  onJoin,
  onDismiss,
  onAccept,
  onDecline,
}: {
  notice: IncomingCall | null;
  confirm: IncomingCall | null;
  ringing: boolean;
  topInset: number;
  onJoin: () => void;
  onDismiss: () => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  useEffect(() => {
    if (!ringing) {
      stopRingtone();
      return;
    }
    startRingtone();
    return () => stopRingtone();
  }, [ringing]);

  return (
    <>
      {notice && !confirm ? (
        <View pointerEvents="box-none" style={[styles.bannerWrap, { top: topInset + 12 }]}>
          <View style={styles.banner}>
            <RingPulse active={ringing} />
            <View style={styles.copy}>
              <Text style={styles.bannerTitle}>{notice.startedName} started the call</Text>
              <Text style={styles.bannerMeta}>in {notice.roomName}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Join ${notice.startedName}'s call`}
              onPress={onJoin}
              style={({ pressed }) => [styles.join, webPointer, pressed && styles.pressed]}
            >
              <Text style={styles.joinLabel}>Join</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Not now"
              onPress={onDismiss}
              style={({ pressed }) => [styles.quiet, webPointer, pressed && styles.pressed]}
            >
              <Text style={styles.bannerQuiet}>Not now</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {confirm ? (
        <Modal transparent visible animationType="fade" onRequestClose={onDecline}>
          <View style={styles.scrim}>
            <View style={styles.dialog}>
              <Text style={[text.title, font.brand]}>Do you want to join?</Text>
              <Text style={[text.body, font.content, styles.dialogBody]}>
                {confirm.startedName} started the call in {confirm.roomName}.
              </Text>
              <View style={styles.dialogActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Not now"
                  onPress={onDecline}
                  style={({ pressed }) => [styles.quiet, webPointer, pressed && styles.pressed]}
                >
                  <Text style={styles.quietLabel}>Not now</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Join call in ${confirm.roomName}`}
                  onPress={onAccept}
                  style={({ pressed }) => [styles.dialogJoin, webPointer, pressed && styles.pressed]}
                >
                  <Text style={styles.dialogJoinLabel}>Join</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

function RingPulse({ active }: { active: boolean }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      anim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, anim]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

  return (
    <View style={styles.ringBox}>
      {active ? <Animated.View style={[styles.halo, { opacity, transform: [{ scale }] }]} /> : null}
      <View style={styles.ringCore}>
        <GeometricIcon name="call" size={16} color={colors.youText} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
  },
  banner: {
    width: "100%",
    maxWidth: 520,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 10,
    borderRadius: 16,
    backgroundColor: colors.navy,
    shadowColor: "#142033",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  bannerTitle: {
    ...font.ui,
    color: colors.sidebarText,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  bannerMeta: {
    ...font.content,
    color: colors.sidebarMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  ringBox: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.burgundy,
  },
  ringCore: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.burgundy,
    alignItems: "center",
    justifyContent: "center",
  },
  join: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: colors.youText,
    alignItems: "center",
    justifyContent: "center",
  },
  joinLabel: {
    ...font.ui,
    color: colors.navy,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
  },
  quiet: {
    minHeight: 36,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  quietLabel: {
    ...font.ui,
    color: colors.burgundy,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  bannerQuiet: {
    ...font.ui,
    color: colors.sidebarText,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  dialogJoin: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  dialogJoinLabel: {
    ...font.ui,
    color: colors.youText,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.72,
  },
  scrim: {
    flex: 1,
    backgroundColor: "rgba(20, 32, 51, 0.28)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 8,
  },
  dialogBody: {
    marginTop: 4,
  },
  dialogActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
});
