import { useEffect } from "react";
import { useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { GeometricIcon } from "@/components/GeometricIcon";
import { canAccessRoom } from "@/domain/membership";
import type { RoomId } from "@/domain/types";
import { useCallControls, useCallSession } from "@/features/call/CallSession";
import { MediaView } from "@/features/call/MediaView";
import { initialsFor, tilesForCall } from "@/features/call/tiles";
import { roomIcon } from "@/features/rooms/roomIcons";
import { useSession } from "@/session/Session";
import { webPointer } from "@/theme/pressable";
import { colors, text } from "@/theme/tokens";
import { getTransport } from "@/transport";

function readRoom(value: string | string[] | undefined): RoomId | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = raw?.trim();
  return id ? id : null;
}

export function CallScreen() {
  const { clientId } = useSession();
  const { roomId: activeRoomId, holdRoomId, startCall } = useCallSession();
  const params = useLocalSearchParams<{ room?: string | string[] }>();
  const requested = readRoom(params.room);
  const roomId = requested ?? activeRoomId;

  useEffect(() => {
    if (!requested || requested === activeRoomId || requested === holdRoomId) {
      return;
    }
    startCall(requested);
  }, [requested, activeRoomId, holdRoomId, startCall]);
  const room = getTransport()
    .snapshot("rooms")
    .rooms.find((item) => item.id === roomId && canAccessRoom(item, clientId));

  if (!room) {
    return <RoomPicker />;
  }

  return <RoomCall roomId={room.id} roomName={room.name} />;
}

function RoomPicker() {
  const { startCall } = useCallSession();
  const { clientId } = useSession();
  const rooms = getTransport()
    .snapshot("rooms")
    .rooms.filter((room) => canAccessRoom(room, clientId));

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={text.title}>
          Call
        </Text>
        <Text style={text.meta}>Choose a room</Text>
      </View>
      <ScrollView contentContainerStyle={styles.picker}>
        {rooms.map((room) => (
          <Pressable
            key={room.id}
            accessibilityRole="button"
            accessibilityLabel={`Start call in ${room.name}`}
            onPress={() => startCall(room.id)}
            style={({ pressed }) => [styles.roomRow, webPointer, pressed && styles.pressed]}
          >
            <View style={styles.glyph}>
              <GeometricIcon name={roomIcon(room.id)} size={16} color={colors.burgundy} />
            </View>
            <View style={styles.roomCopy}>
              <Text style={text.label}>{room.name}</Text>
              <Text style={text.meta}>Start a call</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function columnsFor(count: number) {
  if (count <= 1) {
    return 1;
  }
  if (count <= 4) {
    return 2;
  }
  if (count <= 9) {
    return 3;
  }
  return 4;
}

function RoomCall({ roomName }: { roomId: RoomId; roomName: string }) {
  const { name } = useSession();
  const { minimize } = useCallSession();
  const call = useCallControls();
  if (!call || call === null) {
    return (
      <View style={styles.screen}>
        <Text style={text.meta}>Connecting…</Text>
      </View>
    );
  }
  const tiles = tilesForCall(name, call);
  const columns = columnsFor(tiles.length);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Minimize call"
            onPress={minimize}
            style={({ pressed }) => [styles.minimize, webPointer, pressed && styles.pressed]}
          >
            <MinimizeIcon color={colors.ink} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={text.title}>
              {roomName}
            </Text>
            <Text style={text.meta}>{tiles.length === 1 ? "Waiting for others to join" : `${tiles.length} in this call`}</Text>
          </View>
        </View>
      </View>
      <View style={styles.meeting}>
        <ScrollView style={styles.stage} contentContainerStyle={styles.stageScroll}>
          <View style={styles.grid}>
            {tiles.map((person) => (
              <View
                key={person.id}
                style={[styles.cell, { width: `${100 / columns}%` }, tiles.length === 1 && styles.cellSolo]}
              >
                <Tile
                  name={person.self ? `${person.name} (you)` : person.name}
                  muted={person.muted}
                  cameraOff={person.cameraOff}
                  stream={person.stream}
                  self={person.self}
                />
              </View>
            ))}
          </View>
        </ScrollView>
        <View style={styles.controls}>
          <View style={styles.toggles}>
            <StateButton
              kind="mic"
              off={call.muted}
              label={call.muted ? "Muted" : "Mic on"}
              hint={call.muted ? "Microphone is muted" : "Microphone is on"}
              onPress={call.toggleMute}
            />
            <StateButton
              kind="camera"
              off={call.cameraOff}
              label={call.cameraOff ? "Camera off" : "Camera on"}
              hint={call.cameraOff ? "Camera is off" : "Camera is on"}
              onPress={call.toggleCamera}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Leave call"
            onPress={call.leave}
            style={({ pressed }) => [styles.leave, webPointer, pressed && styles.pressed]}
          >
            <Text style={styles.leaveLabel}>Leave</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Tile({
  name,
  muted,
  cameraOff,
  stream,
}: {
  name: string;
  muted: boolean;
  cameraOff: boolean;
  stream: unknown;
  self: boolean;
}) {
  const showVideo = stream != null && !cameraOff;
  const initials = initialsFor(name);
  return (
    <View style={[styles.tile, cameraOff && styles.tileDimmed]}>
      {showVideo ? <MediaView stream={stream} silent /> : null}
      {showVideo ? null : (
        <View style={styles.avatar}>
          <Text style={styles.initials}>{initials || "?"}</Text>
        </View>
      )}
      <View style={styles.badge}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {muted ? <Text style={styles.tileMeta}>Muted</Text> : null}
        {cameraOff ? <Text style={styles.tileMeta}>Camera off</Text> : null}
      </View>
    </View>
  );
}

function StateButton({
  kind,
  off,
  label,
  hint,
  onPress,
}: {
  kind: "mic" | "camera";
  off: boolean;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  const iconColor = off ? colors.youText : colors.online;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      accessibilityState={{ selected: !off }}
      onPress={onPress}
      style={({ pressed }) => [styles.stateButton, off ? styles.stateOff : styles.stateLive, webPointer, pressed && styles.pressed]}
    >
      <View style={styles.iconSlot}>
        {kind === "mic" ? <MicIcon color={iconColor} /> : <CameraIcon color={iconColor} />}
        {off ? <View style={styles.slash} /> : null}
      </View>
      <Text style={[styles.stateLabel, off ? styles.stateLabelOff : styles.stateLabelLive]}>{label}</Text>
    </Pressable>
  );
}

function MicIcon({ color }: { color: string }) {
  return (
    <View style={styles.mic}>
      <View style={[styles.micHead, { borderColor: color }]} />
      <View style={[styles.micCup, { borderColor: color }]} />
      <View style={[styles.micStem, { backgroundColor: color }]} />
    </View>
  );
}

function CameraIcon({ color }: { color: string }) {
  return (
    <View style={[styles.camera, { borderColor: color }]}>
      <View style={[styles.cameraLens, { borderColor: color }]} />
    </View>
  );
}

function MinimizeIcon({ color }: { color: string }) {
  return (
    <View style={styles.minimizeIcon}>
      <View style={[styles.minimizeBack, { borderColor: color }]} />
      <View style={[styles.minimizeFront, { borderColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  minimize: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  minimizeIcon: {
    width: 16,
    height: 16,
  },
  minimizeBack: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 9,
    height: 9,
    borderWidth: 1.75,
    borderRadius: 1,
  },
  minimizeFront: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 9,
    height: 9,
    borderWidth: 1.75,
    borderRadius: 1,
    backgroundColor: colors.surface,
  },
  picker: {
    paddingVertical: 8,
    paddingBottom: 24,
  },
  roomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 12,
  },
  glyph: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.burgundySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  roomCopy: {
    flex: 1,
    gap: 2,
  },
  meeting: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  stage: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.navy,
    borderRadius: 18,
  },
  stageScroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  cell: {
    padding: 6,
    aspectRatio: 16 / 9,
  },
  cellSolo: {
    width: "100%",
    maxWidth: 960,
  },
  tile: {
    flex: 1,
    position: "relative",
    borderRadius: 14,
    backgroundColor: colors.navyRaised,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  tileDimmed: {
    opacity: 0.72,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.burgundy,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: colors.youText,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "600",
  },
  badge: {
    position: "absolute",
    left: 10,
    bottom: 10,
    maxWidth: "90%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(26, 39, 68, 0.78)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  name: {
    color: colors.sidebarText,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    flexShrink: 1,
  },
  tileMeta: {
    color: colors.sidebarMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  toggles: {
    flexGrow: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  stateButton: {
    minHeight: 52,
    minWidth: 124,
    paddingHorizontal: 14,
    borderRadius: 26,
    borderWidth: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  stateLive: {
    backgroundColor: "#E7F6EE",
    borderColor: colors.online,
  },
  stateOff: {
    backgroundColor: colors.burgundy,
    borderColor: colors.burgundy,
  },
  stateLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
  },
  stateLabelLive: {
    color: "#1E6B40",
  },
  stateLabelOff: {
    color: colors.youText,
  },
  iconSlot: {
    width: 22,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  slash: {
    position: "absolute",
    width: 22,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.youText,
    transform: [{ rotate: "-40deg" }],
  },
  mic: {
    width: 16,
    height: 18,
    alignItems: "center",
  },
  micHead: {
    width: 8,
    height: 10,
    borderRadius: 4,
    borderWidth: 1.75,
  },
  micCup: {
    width: 12,
    height: 6,
    marginTop: -3,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderWidth: 1.75,
    borderTopWidth: 0,
  },
  micStem: {
    width: 1.75,
    height: 3,
  },
  camera: {
    width: 20,
    height: 14,
    borderRadius: 3,
    borderWidth: 1.75,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraLens: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1.5,
  },
  leave: {
    minHeight: 52,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: "#8E2F2F",
    alignItems: "center",
    justifyContent: "center",
  },
  leaveLabel: {
    color: colors.youText,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.72,
  },
});
