import { useLocalSearchParams } from "expo-router";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { BackButton } from "@/components/BackButton";
import { GeometricIcon } from "@/components/GeometricIcon";
import { canAccessRoom } from "@/domain/membership";
import type { RoomId } from "@/domain/types";
import { MediaView } from "@/features/call/MediaView";
import { startRoomCall } from "@/features/call/startCall";
import { useRoomCall } from "@/features/call/useRoomCall";
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
  const params = useLocalSearchParams<{ room?: string | string[] }>();
  const roomId = readRoom(params.room);
  const room = getTransport()
    .snapshot("rooms")
    .rooms.find((item) => item.id === roomId && canAccessRoom(item, clientId));

  if (!room) {
    return <RoomPicker />;
  }

  return <RoomCall roomId={room.id} roomName={room.name} />;
}

function RoomPicker() {
  const { name, clientId } = useSession();
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
            onPress={() => startRoomCall(room.id, name, clientId)}
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

function RoomCall({ roomId, roomName }: { roomId: RoomId; roomName: string }) {
  const { name } = useSession();
  const call = useRoomCall(roomId);
  const tiles = [
    ...call.participants.map((person) => ({ ...person, self: false })),
    {
      id: "self",
      name: name || "You",
      muted: call.muted,
      cameraOff: call.cameraOff,
      stream: call.localStream,
      self: true,
    },
  ];
  const columns = columnsFor(tiles.length);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={call.leave} />
        <Text accessibilityRole="header" style={text.title}>
          {roomName}
        </Text>
        <Text style={text.meta}>{tiles.length === 1 ? "Waiting for others to join" : `${tiles.length} in this call`}</Text>
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
          <ControlButton
            label={call.muted ? "Muted" : "Mute"}
            selected={call.muted}
            onPress={call.toggleMute}
          />
          <ControlButton
            label={call.cameraOff ? "Camera off" : "Camera"}
            selected={call.cameraOff}
            onPress={call.toggleCamera}
          />
          {Platform.OS === "web" ? (
            <ControlButton label="Leave" selected={false} onPress={call.leave} />
          ) : null}
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
  self,
}: {
  name: string;
  muted: boolean;
  cameraOff: boolean;
  stream: unknown;
  self: boolean;
}) {
  const showVideo = stream != null && !cameraOff;
  const initials = name
    .replace(" (you)", "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
  return (
    <View style={[styles.tile, cameraOff && styles.tileDimmed]}>
      {showVideo ? <MediaView stream={stream} silent={self} /> : null}
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

function ControlButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.control,
        selected && styles.controlSelected,
        webPointer,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.controlLabel}>{label}</Text>
    </Pressable>
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
    gap: 4,
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
    justifyContent: "center",
    gap: 10,
  },
  control: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  controlSelected: {
    backgroundColor: colors.burgundy,
  },
  controlLabel: {
    color: colors.youText,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.72,
  },
});
