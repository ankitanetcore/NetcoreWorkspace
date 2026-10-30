import { createElement, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocalSearchParams } from "expo-router";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { GeometricIcon } from "@/components/GeometricIcon";
import { ArrowDownRightIcon } from "@/components/ChatIcons";
import { canAccessRoom } from "@/domain/membership";
import type { RoomId } from "@/domain/types";
import { useCallControls, useCallSession } from "@/features/call/CallSession";
import { MediaView } from "@/features/call/MediaView";
import { initialsFor, tilesForCall } from "@/features/call/tiles";
import { useActiveSpeaker } from "@/features/call/useActiveSpeaker";
import { roomIcon } from "@/features/rooms/roomIcons";
import { useSession } from "@/session/Session";
import { webMotion, webPointer } from "@/theme/pressable";
import { colors, font, text } from "@/theme/tokens";
import { getTransport } from "@/transport";

function readRoom(value: string | string[] | undefined): RoomId | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = raw?.trim();
  return id ? id : null;
}

export function CallScreen() {
  const { clientId } = useSession();
  const { roomId: activeRoomId, holdRoomId, openLobby } = useCallSession();
  const params = useLocalSearchParams<{ room?: string | string[] }>();
  const requested = readRoom(params.room);
  const roomId = requested ?? activeRoomId;

  useEffect(() => {
    if (!requested || requested === activeRoomId || requested === holdRoomId) {
      return;
    }
    const match = getTransport()
      .snapshot("rooms")
      .rooms.find((item) => item.id === requested && canAccessRoom(item, clientId));
    if (!match) {
      return;
    }
    openLobby({ roomId: match.id, roomName: match.name, mode: "start" });
  }, [requested, activeRoomId, holdRoomId, openLobby, clientId]);
  const room = getTransport()
    .snapshot("rooms")
    .rooms.find((item) => item.id === roomId && canAccessRoom(item, clientId));

  if (!room) {
    return <RoomPicker />;
  }

  return <RoomCall roomId={room.id} roomName={room.name} />;
}

function RoomPicker() {
  const { openLobby } = useCallSession();
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
            onPress={() => openLobby({ roomId: room.id, roomName: room.name, mode: "start" })}
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

function fitFrame(maxWidth: number, maxHeight: number, columns: number, rows: number) {
  const pad = 12;
  const widthBudget = maxWidth - pad;
  const heightBudget = maxHeight - pad;
  if (widthBudget <= 0 || heightBudget <= 0) {
    return { width: 0, height: 0 };
  }
  const ratio = (columns * 16) / (rows * 9);
  let width = widthBudget;
  let height = width / ratio;
  if (height > heightBudget) {
    height = heightBudget;
    width = height * ratio;
  }
  return { width: width + pad, height: height + pad };
}

function RoomCall({ roomName }: { roomId: RoomId; roomName: string }) {
  const { name } = useSession();
  const { minimize } = useCallSession();
  const call = useCallControls();
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const tiles = call ? tilesForCall(name, call) : [];
  const detected = useActiveSpeaker(tiles);
  if (!call) {
    return (
      <View style={styles.screen}>
        <Text style={text.meta}>Connecting…</Text>
      </View>
    );
  }
  const columns = columnsFor(tiles.length);
  const rows = Math.max(1, Math.ceil(tiles.length / columns));
  const frame = fitFrame(stage.width, stage.height, columns, rows);
  const muted = call.muted;
  const cameraOff = call.cameraOff;
  const speakingId = detected.speaking ? detected.id : null;
  const sharing = call.sharing;
  const remoteShare = call.participants.find((person) => person.screenStream);
  const share =
    call.sharing && call.screenStream
      ? { title: "Your screen", stream: call.screenStream, placeholder: false }
      : remoteShare?.screenStream
        ? { title: `${remoteShare.name}'s screen`, stream: remoteShare.screenStream, placeholder: false }
        : null;

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
            <ArrowDownRightIcon size={18} color={colors.ink} strokeWidth={1.75} />
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
        <View
          style={styles.stage}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setStage((current) => (current.width === width && current.height === height ? current : { width, height }));
          }}
        >
          {share || frame.width > 0 ? (
            <View style={[styles.frame, share ? styles.shareFrame : { width: frame.width, height: frame.height }]}>
              {share ? (
                <View style={styles.shareMain}>
                  <MediaView stream={share.stream} silent fit="contain" />
                  <View style={[styles.badge, styles.badgeBottom, styles.shareBadge]}>
                    <Text style={styles.name} numberOfLines={1}>
                      {share.title}
                    </Text>
                  </View>
                </View>
              ) : null}
              <View style={share ? styles.shareRail : styles.grid}>
                {tiles.map((person, index) => {
                  const row = Math.floor(index / columns);
                  const centered = !share && tiles.length === 3 && index === tiles.length - 1;
                  return (
                    <View
                      key={person.id}
                      style={[
                        styles.cell,
                        share ? styles.shareCell : { width: `${100 / columns}%`, height: `${100 / rows}%` },
                        centered ? { marginLeft: `${50 / columns}%` } : null,
                      ]}
                    >
                      <Tile
                        name={person.self ? `${person.name} (you)` : person.name}
                        muted={person.muted}
                        cameraOff={person.cameraOff}
                        stream={person.stream}
                        self={person.self}
                        speaking={person.id === speakingId}
                        compact={Boolean(share)}
                        labelAtTop={share ? false : row === rows - 1}
                      />
                    </View>
                  );
                })}
              </View>
              <DraggableDock>
                  <DockButton
                    label="Mic"
                    hint={muted ? "Unmute microphone" : "Mute microphone"}
                    pressed={muted}
                    tone={muted ? "off" : "on"}
                    onPress={() => call.toggleMute()}
                  >
                    <MicIcon color="#FFFFFF" off={muted} />
                  </DockButton>
                  <DockButton
                    label="Camera"
                    hint={cameraOff ? "Turn camera on" : "Turn camera off"}
                    pressed={cameraOff}
                    tone={cameraOff ? "off" : "on"}
                    onPress={() => call.toggleCamera()}
                  >
                    <CameraIcon color="#FFFFFF" off={cameraOff} />
                  </DockButton>
                  <DockButton
                    label="Share"
                    hint={sharing ? "Stop sharing your screen" : "Share your screen"}
                    pressed={sharing}
                    tone={sharing ? "off" : "on"}
                    onPress={() => call.toggleScreenShare()}
                  >
                    <ScreenIcon />
                  </DockButton>
                  <DockButton
                    label="Leave"
                    hint="Leave call"
                    tone="leave"
                    onPress={() => call.leave()}
                  >
                    <HangUpIcon />
                  </DockButton>
              </DraggableDock>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

type DockCorner = "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

function dockPlacement(corner: DockCorner): ViewStyle {
  switch (corner) {
    case "top-left":
      return { top: 16, left: 16 };
    case "top-right":
      return { top: 16, right: 16 };
    case "bottom-left":
      return { bottom: 22, left: 16 };
    case "bottom-right":
      return { bottom: 22, right: 16 };
    default:
      return { bottom: 22, left: 12, right: 12, alignItems: "center" };
  }
}

function nearestDockCorner(x: number, y: number, width: number, height: number): DockCorner {
  if (y >= height / 2 && Math.abs(x - width / 2) < width * 0.18) {
    return "bottom";
  }
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

function DraggableDock({ children }: { children: ReactNode }) {
  const slotRef = useRef<View>(null);
  const [corner, setCorner] = useState<DockCorner>("bottom");
  const [drag, setDrag] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }
    const slotNode = slotRef.current as unknown as HTMLElement | null;
    const frameNode = slotNode?.parentElement ?? null;
    if (!slotNode || !frameNode) {
      return;
    }
    const slot: HTMLElement = slotNode;
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
      const box = slot.getBoundingClientRect();
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
      const box = slot.getBoundingClientRect();
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
      const box = slot.getBoundingClientRect();
      setCorner(
        nearestDockCorner(box.left - frameBox.left + box.width / 2, box.top - frameBox.top + box.height / 2, frameBox.width, frameBox.height),
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

    slot.addEventListener("pointerdown", onDown);
    slot.addEventListener("click", onClick, true);
    return () => {
      slot.removeEventListener("pointerdown", onDown);
      slot.removeEventListener("click", onClick, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  return (
    <View
      ref={slotRef}
      pointerEvents="box-none"
      style={[
        styles.dockSlot,
        drag ? { top: drag.top, left: drag.left } : dockPlacement(corner),
        Platform.OS === "web" ? ({ cursor: drag ? "grabbing" : "grab" } as unknown as ViewStyle) : null,
      ]}
    >
      <View accessibilityRole="toolbar" accessibilityLabel="Call controls" style={styles.dock}>
        {children}
      </View>
    </View>
  );
}

function Tile({
  name,
  muted,
  cameraOff,
  stream,
  speaking,
  compact = false,
  labelAtTop,
}: {
  name: string;
  muted: boolean;
  cameraOff: boolean;
  stream: unknown;
  self: boolean;
  speaking: boolean;
  compact?: boolean;
  labelAtTop: boolean;
}) {
  const showVideo = stream != null && !cameraOff;
  const initials = initialsFor(name);
  return (
    <View style={[styles.tile, cameraOff && styles.tileDimmed, speaking && styles.tileSpeaking, compact && styles.tileCompact]}>
      {showVideo ? <MediaView stream={stream} silent fit={compact ? "cover" : "contain"} /> : null}
      {showVideo ? null : (
        <View style={[styles.avatar, compact && styles.avatarCompact]}>
          <Text style={[styles.initials, compact && styles.initialsCompact]}>{initials || "?"}</Text>
        </View>
      )}
      <View style={[styles.badge, labelAtTop ? styles.badgeTop : styles.badgeBottom]}>
        {speaking ? <View style={styles.speakingDot} /> : null}
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {muted ? <Text style={styles.tileMeta}>Muted</Text> : null}
        {cameraOff && !compact ? <Text style={styles.tileMeta}>Camera off</Text> : null}
      </View>
    </View>
  );
}

const onTone = { rest: "rgba(255, 255, 255, 0.14)", hover: "rgba(255, 255, 255, 0.24)", pressed: "rgba(255, 255, 255, 0.32)" };
const offTone = { rest: "rgba(166, 62, 69, 0.55)", hover: "rgba(166, 62, 69, 0.7)", pressed: "rgba(146, 48, 54, 0.82)" };
const leaveTone = { rest: "#A63E45", hover: "#8E343A", pressed: "#7C2E33" };

function DockButton({
  label,
  hint,
  pressed = false,
  tone,
  onPress,
  children,
}: {
  label: string;
  hint: string;
  pressed?: boolean;
  tone: "on" | "off" | "leave";
  onPress: () => void;
  children: ReactNode;
}) {
  const [tip, setTip] = useState(false);
  const colorsFor = tone === "leave" ? leaveTone : tone === "off" ? offTone : onTone;
  return (
    <View style={styles.control}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={hint}
        {...(Platform.OS === "web" && tone !== "leave" ? ({ "aria-pressed": pressed } as { "aria-pressed": boolean }) : null)}
        onPress={onPress}
        onHoverIn={() => setTip(true)}
        onHoverOut={() => setTip(false)}
        onFocus={() => setTip(true)}
        onBlur={() => setTip(false)}
        style={(state) => {
          const interaction = state as { pressed: boolean; hovered?: boolean; focused?: boolean };
          const backgroundColor = interaction.pressed
            ? colorsFor.pressed
            : interaction.hovered
              ? colorsFor.hover
              : colorsFor.rest;
          return [
            styles.controlButton,
            tone === "leave" && styles.leaveButton,
            { backgroundColor },
            interaction.focused ? styles.controlFocus : null,
            webPointer,
            webMotion,
          ];
        }}
      >
        {children}
      </Pressable>
      <Text style={styles.controlLabel}>{label}</Text>
      {tip ? (
        <View style={styles.tooltip} pointerEvents="none">
          <Text style={styles.tooltipText}>{hint}</Text>
        </View>
      ) : null}
    </View>
  );
}

function MicIcon({ color, off = false }: { color: string; off?: boolean }) {
  return (
    <View style={styles.iconSlot}>
      <View style={styles.mic}>
        <View style={[styles.micHead, { borderColor: color }]} />
        <View style={[styles.micCup, { borderColor: color }]} />
        <View style={[styles.micStem, { backgroundColor: color }]} />
      </View>
      {off ? <View style={[styles.slash, { backgroundColor: color }]} /> : null}
    </View>
  );
}

function CameraIcon({ color, off = false }: { color: string; off?: boolean }) {
  return (
    <View style={styles.iconSlot}>
      <View style={[styles.camera, { borderColor: color }]}>
        <View style={[styles.cameraLens, { borderColor: color }]} />
      </View>
      {off ? <View style={[styles.slash, { backgroundColor: color }]} /> : null}
    </View>
  );
}

function ScreenIcon() {
  return (
    <View style={styles.iconSlot}>
      <View style={styles.screenFrame}>
        <View style={styles.screenArrow} />
      </View>
      <View style={styles.screenStand} />
    </View>
  );
}

function HangUpIcon() {
  return (
    <View style={styles.hangup}>
      {createElement(
        "svg",
        {
          width: 22,
          height: 22,
          viewBox: "0 0 24 24",
          fill: "#FFFFFF",
          "aria-hidden": true,
        },
        createElement("path", {
          d: "M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z",
        }),
      )}
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
  },
  stage: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    maxWidth: "100%",
    maxHeight: "100%",
    backgroundColor: colors.navy,
    borderRadius: 18,
    padding: 6,
    position: "relative",
  },
  grid: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    width: "100%",
    height: "100%",
  },
  cell: {
    padding: 4,
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
  tileSpeaking: {
    borderWidth: 2,
    borderColor: colors.onlineOnNavy,
  },
  tileCompact: {
    borderRadius: 10,
  },
  avatarCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  initialsCompact: {
    fontSize: 16,
    lineHeight: 20,
  },
  shareFrame: {
    width: "100%",
    height: "100%",
    flexDirection: "row",
    padding: 8,
    gap: 8,
  },
  shareMain: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: colors.navyRaised,
  },
  shareBadge: {
    bottom: 92,
  },
  shareRail: {
    width: 176,
    alignSelf: "stretch",
    flexGrow: 0,
    flexShrink: 0,
    paddingBottom: 96,
    ...(Platform.OS === "web" ? ({ overflowY: "auto" } as ViewStyle) : null),
  },
  shareCell: {
    width: "100%",
    height: 126,
  },
  speakingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.onlineOnNavy,
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
    maxWidth: "90%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(26, 39, 68, 0.78)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeBottom: {
    bottom: 10,
  },
  badgeTop: {
    top: 10,
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
  dockSlot: {
    position: "absolute",
    zIndex: 3,
  },
  dock: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 14,
    maxWidth: "100%",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    backgroundColor: "rgba(21, 27, 39, 0.65)",
    ...(Platform.OS === "web"
      ? ({ backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" } as ViewStyle)
      : null),
  },
  control: {
    width: 62,
    alignItems: "center",
    gap: 4,
    position: "relative",
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  leaveButton: {
    width: 44,
    height: 44,
  },
  controlFocus: Platform.OS === "web"
    ? ({
        outlineStyle: "solid",
        outlineWidth: 2,
        outlineColor: "rgba(255, 255, 255, 0.92)",
        outlineOffset: 3,
      } as ViewStyle)
    : {
        borderWidth: 2,
        borderColor: "rgba(255, 255, 255, 0.92)",
      },
  controlLabel: {
    ...font.ui,
    color: "rgba(255, 255, 255, 0.88)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    textAlign: "center",
  },
  tooltip: {
    position: "absolute",
    bottom: "100%",
    left: "50%",
    marginBottom: 6,
    maxWidth: 168,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(21, 27, 39, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    zIndex: 4,
    transform: [{ translateX: "-50%" }],
  },
  tooltipText: {
    ...font.ui,
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    textAlign: "center",
  },
  iconSlot: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  slash: {
    position: "absolute",
    width: 22,
    height: 1.75,
    borderRadius: 1,
    transform: [{ rotate: "-42deg" }],
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
  screenFrame: {
    width: 22,
    height: 15,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  screenArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#FFFFFF",
  },
  screenStand: {
    width: 12,
    height: 2,
    marginTop: 2,
    borderRadius: 1,
    backgroundColor: "#FFFFFF",
  },
  cameraLens: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1.5,
  },
  hangup: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.72,
  },
});
