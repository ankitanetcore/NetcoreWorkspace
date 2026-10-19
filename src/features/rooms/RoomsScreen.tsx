import type { DocumentPickerAsset } from "expo-document-picker";
import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { BackButton } from "@/components/BackButton";
import { GeometricIcon } from "@/components/GeometricIcon";
import { canAccessRoom, normalizeRoom } from "@/domain/membership";
import type { PresencePeer, Room, RoomMessage, RoomsSnapshot } from "@/domain/types";
import { joinRoomCall, startRoomCall } from "@/features/call/startCall";
import { DirectPane, Composer, type OutgoingMessage } from "@/features/direct/DirectPane";
import { assetFromFile } from "@/features/files/desktopFile";
import { FileDropSurface } from "@/features/files/FileDropSurface";
import { SharedFileCard } from "@/features/files/SharedFileCard";
import { readDirectThreads } from "@/features/direct/direct";
import { continuesSender, previewText } from "@/features/messages/preview";
import { clearSelection, selectDirect, selectRoom, useConversationSelection } from "@/features/messages/selection";
import { markRead } from "@/features/messages/readState";
import {
  CreateRoomDialog,
  DeleteRoomDialog,
  memberCount,
  memberLabel,
  MembersDialog,
  publishRooms,
  RenameRoomDialog,
  RoomOptionsMenu,
  useKnownPeers,
} from "@/features/rooms/RoomDialogs";
import { roomIcon } from "@/features/rooms/roomIcons";
import { columnTextStyle } from "@/features/messages/columnText";
import { displayNameFor } from "@/session/displayName";
import { useSession } from "@/session/Session";
import { currentClientId } from "@/session/currentIdentity";
import { webPointer } from "@/theme/pressable";
import { colors, font, layout, text } from "@/theme/tokens";
import { getTransport } from "@/transport";
import type { TransportEnvelope } from "@/transport/types";

interface ActiveRoomCall {
  roomId: string;
  startedBy?: string;
  startedName: string;
  participantIds: string[];
}

function readRooms(): RoomsSnapshot {
  const clientId = currentClientId();
  const next = getTransport().snapshot("rooms");
  return {
    rooms: next.rooms
      .map((room) => normalizeRoom(room))
      .filter((room) => canAccessRoom(room, clientId))
      .map((room) => ({ ...room, messages: [...room.messages] })),
  };
}

export function RoomsScreen() {
  const [snapshot, setSnapshot] = useState(readRooms);
  const [threads, setThreads] = useState(readDirectThreads);
  const { width } = useWindowDimensions();
  const split = width >= layout.desktopMinWidth;
  const [creating, setCreating] = useState(false);
  const selection = useConversationSelection();

  useEffect(() => {
    const refresh = () => {
      setSnapshot(readRooms());
      setThreads(readDirectThreads());
    };
    const stopRooms = getTransport().subscribe("rooms", refresh);
    const stopDirect = getTransport().subscribe("direct", refresh);
    return () => {
      stopRooms();
      stopDirect();
    };
  }, []);

  useEffect(() => {
    if (selection?.kind === "room" && !snapshot.rooms.some((room) => room.id === selection.id)) {
      clearSelection();
    }
  }, [selection, snapshot.rooms]);

  useEffect(() => {
    if (split && selection === null && snapshot.rooms[0]) {
      selectRoom(snapshot.rooms[0].id);
    }
  }, [split, selection, snapshot.rooms]);

  const selected = selection?.kind === "room" ? (snapshot.rooms.find((room) => room.id === selection.id) ?? null) : null;
  const peerId = selection?.kind === "direct" ? selection.peerId : null;
  const showList = !split && selection === null;
  const showThread = selected !== null || peerId !== null;

  return (
    <View style={[styles.screen, split && styles.split]}>
      {showList ? (
        <View style={[styles.list, split ? styles.listSplit : styles.listFill]}>
          <View style={[styles.listHeader, split && styles.alignedHeader]}>
            <Text accessibilityRole="header" style={text.paneTitle}>
              Rooms
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New Room"
              onPress={() => setCreating(true)}
              style={({ pressed }) => [styles.addRoom, webPointer, pressed && styles.pressed]}
            >
              <Text style={styles.addRoomLabel}>+</Text>
            </Pressable>
          </View>
          {creating ? (
            <CreateRoomDialog
              onClose={() => setCreating(false)}
              onCreated={(roomId) => {
                setCreating(false);
                selectRoom(roomId);
              }}
            />
          ) : null}
          <ScrollView contentContainerStyle={styles.listContent}>
            <PresenceBlock />
            {snapshot.rooms.map((room) => (
              <RoomRow key={room.id} room={room} active={false} onPress={() => selectRoom(room.id)} />
            ))}
            <Text style={styles.mobileSection}>Direct Messages</Text>
            {threads.length === 0 ? <Text style={styles.mobileEmpty}>No conversations yet</Text> : null}
            {threads.map((thread) => (
              <MobileDirectRow key={thread.id} participantIds={thread.participantIds} onPress={selectDirect} />
            ))}
          </ScrollView>
        </View>
      ) : null}
      {showThread && selected ? (
        <Thread room={selected} showPresence={!split} onBack={split ? undefined : clearSelection} />
      ) : null}
      {showThread && peerId ? <DirectPane peerId={peerId} onBack={split ? undefined : clearSelection} /> : null}
    </View>
  );
}

function readPresence(): PresencePeer[] {
  return getTransport()
    .snapshot("presence")
    .peers.filter((peer) => peer.displayName.length > 0)
    .slice()
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "online" ? -1 : 1;
      }
      const name = left.displayName.localeCompare(right.displayName);
      if (name !== 0) {
        return name;
      }
      return left.clientId.localeCompare(right.clientId);
    });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function PresenceBlock({ nested = false }: { nested?: boolean }) {
  const { clientId } = useSession();
  const [peers, setPeers] = useState(readPresence);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    return getTransport().subscribe("presence", () => {
      setPeers(readPresence());
    });
  }, []);

  if (peers.length === 0) {
    return null;
  }

  const online = peers.filter((peer) => peer.status === "online");
  const shown = online.slice(0, 4);
  const extra = online.length - shown.length;

  return (
    <View style={nested ? styles.presenceNested : styles.presence}>
      <View style={styles.presenceRow}>
        <View style={styles.presenceCount}>
          <View style={styles.presenceDot} />
          <Text style={styles.presenceLabel}>{online.length} connected</Text>
        </View>
        {online.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Connected people"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((value) => !value)}
            style={({ pressed }) => [styles.avatars, webPointer, pressed && styles.pressed]}
          >
            {shown.map((peer, index) => (
              <View key={peer.clientId} style={[styles.avatar, index > 0 && styles.avatarOverlap]}>
                <Text style={styles.avatarLabel}>{initials(peer.displayName)}</Text>
              </View>
            ))}
            {extra > 0 ? (
              <View style={[styles.avatar, styles.avatarOverlap, styles.avatarMore]}>
                <Text style={styles.avatarMoreLabel}>+{extra}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>
      {open ? (
        <View style={styles.presenceNames}>
          {online.map((peer) => (
            <Text key={peer.clientId} style={styles.presenceName} numberOfLines={1}>
              {peer.displayName}
              {peer.clientId === clientId ? " (you)" : ""}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function MobileDirectRow({
  participantIds,
  onPress,
}: {
  participantIds: string[];
  onPress: (peerId: string) => void;
}) {
  const { clientId } = useSession();
  const peers = useKnownPeers();
  const peerId = participantIds.find((id) => id !== clientId) ?? "";
  const peer = peers.find((item) => item.clientId === peerId);
  if (!peerId) {
    return null;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={peer?.displayName || "Direct message"}
      onPress={() => onPress(peerId)}
      style={({ pressed }) => [styles.row, webPointer, pressed && styles.pressed]}
    >
      <View style={[styles.presenceDot, peer?.status === "online" ? styles.presenceDotOn : styles.presenceDotOff]} />
      <View style={styles.rowCopy}>
        <Text style={styles.rowName} numberOfLines={1}>
          {peer?.displayName || peerId.slice(0, 8)}
        </Text>
      </View>
    </Pressable>
  );
}

function RoomRow({
  room,
  active,
  onPress,
}: {
  room: Room;
  active: boolean;
  onPress: () => void;
}) {
  const { clientId, name } = useSession();
  const peers = useKnownPeers();
  const last = room.messages[room.messages.length - 1];
  const previewName = last ? displayNameFor(peers, last.authorId, last.author, { clientId, name }) : "";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        active && styles.rowActive,
        webPointer,
        pressed && styles.pressed,
      ]}
    >
      {active ? <View style={styles.rowBar} /> : null}
      <GeometricIcon name={roomIcon(room.id)} size={16} color={active ? colors.burgundy : colors.navy} />
      <View style={styles.rowCopy}>
        <View style={styles.rowTitle}>
          <Text style={styles.rowName} numberOfLines={1}>
            {room.name}
          </Text>
          {last?.time ? <Text style={styles.rowTime}>{last.time}</Text> : null}
        </View>
        <Text style={styles.rowPreview} numberOfLines={1}>
          {last ? `${previewName}: ${previewText(last)}` : "No messages yet"}
        </Text>
      </View>
    </Pressable>
  );
}

function removeRoom(roomId: string) {
  publishRooms("delete", `delete-${roomId}-${Date.now()}`, { roomId });
}

function useActiveRoomCall(roomId: string) {
  const [call, setCall] = useState<ActiveRoomCall | null>(null);

  useEffect(() => {
    return getTransport().subscribe("call", (envelope) => {
      const next = callForRoom(roomId, envelope);
      if (next !== undefined) {
        setCall(next);
      }
    });
  }, [roomId]);

  return call;
}

function callForRoom(roomId: string, envelope: TransportEnvelope): ActiveRoomCall | null | undefined {
  if (envelope.type === "roster") {
    const calls = (envelope.payload as { calls?: ActiveRoomCall[] }).calls ?? [];
    return calls.find((item) => item.roomId === roomId) ?? null;
  }
  if (envelope.type !== "status") {
    return undefined;
  }
  const payload = envelope.payload as ActiveRoomCall & { active?: boolean; roomId?: string };
  if (payload.roomId !== roomId) {
    return undefined;
  }
  if (!payload.active) {
    return null;
  }
  return {
    roomId,
    startedBy: payload.startedBy,
    startedName: payload.startedName,
    participantIds: payload.participantIds ?? [],
  };
}

function Thread({
  room,
  showPresence,
  onBack,
}: {
  room: Room;
  showPresence: boolean;
  onBack?: () => void;
}) {
  const { name, clientId } = useSession();
  const peers = useKnownPeers();
  const call = useActiveRoomCall(room.id);
  const incoming = call && !call.participantIds.includes(clientId) ? call : null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const count = memberCount(room, peers);
  const listRef = useRef<ScrollView>(null);
  const stickToEnd = useRef(true);
  const [dropped, setDropped] = useState<DocumentPickerAsset | null>(null);
  const [droppedExtra, setDroppedExtra] = useState(0);

  useEffect(() => {
    setMenuOpen(false);
    setMembersOpen(false);
    setRenaming(false);
    setConfirming(false);
    setDropped(null);
    setDroppedExtra(0);
  }, [room.id]);

  useEffect(() => {
    const last = room.messages[room.messages.length - 1];
    if (last) {
      markRead(room.id, last.id);
    }
  }, [room.id, room.messages]);

  function rename(nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === room.name) {
      setRenaming(false);
      return;
    }
    publishRooms("rename", `rename-${room.id}-${Date.now()}`, { roomId: room.id, name: trimmed });
    setRenaming(false);
  }

  return (
    <View style={styles.thread}>
      <View style={[styles.threadHeader, onBack ? null : styles.alignedHeader]}>
        {onBack ? <BackButton onPress={onBack} /> : null}
        <View style={styles.threadTitleRow}>
          <View style={styles.threadTitle}>
            <View style={styles.glyphActive}>
              <GeometricIcon name={roomIcon(room.id)} size={16} color={colors.burgundy} />
            </View>
            <Text accessibilityRole="header" style={[text.title, styles.threadName]} numberOfLines={1}>
              {room.name}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={memberLabel(count)}
            onPress={() => setMembersOpen(true)}
            style={({ pressed }) => [webPointer, pressed && styles.pressed]}
          >
            <Text style={styles.memberCount}>{memberLabel(count)}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Room options"
            onPress={() => setMenuOpen(true)}
            style={({ pressed }) => [styles.overflowButton, webPointer, pressed && styles.pressed]}
          >
            <Text style={styles.overflowLabel}>•••</Text>
          </Pressable>
          {call ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Start call in ${room.name}`}
              onPress={() => startRoomCall(room.id, name, clientId)}
              style={({ pressed }) => [styles.callButton, webPointer, pressed && styles.pressed]}
            >
              <GeometricIcon name="call" size={16} color={colors.youText} />
              <Text style={styles.callLabel}>Start Call</Text>
            </Pressable>
          )}
        </View>
        {showPresence ? <PresenceBlock nested /> : null}
      </View>
      {incoming ? (
        <View style={styles.invite}>
          <Text style={styles.inviteText}>
            {displayNameFor(peers, incoming.startedBy, incoming.startedName, { clientId, name })} started a call
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Join"
            onPress={() => joinRoomCall(room.id)}
            style={({ pressed }) => [styles.joinButton, webPointer, pressed && styles.pressed]}
          >
            <Text style={styles.callLabel}>Join</Text>
          </Pressable>
        </View>
      ) : null}
      <FileDropSurface
        label={`Drop a file to attach it in ${room.name}. You still press Send.`}
        onFiles={(files) => {
          const [first, ...rest] = files;
          if (!first) {
            return;
          }
          setDropped(assetFromFile(first));
          setDroppedExtra(rest.length);
        }}
      >
      {room.messages.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[text.meta, font.content]}>No messages yet</Text>
        </View>
      ) : (
        <ScrollView
          ref={listRef}
          contentContainerStyle={styles.messages}
          scrollEventThrottle={16}
          onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
            const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
            stickToEnd.current = contentSize.height - layoutMeasurement.height - contentOffset.y < 48;
          }}
          onContentSizeChange={() => {
            if (stickToEnd.current) {
              listRef.current?.scrollToEnd({ animated: false });
            }
          }}
        >
          {room.messages.map((message, index) => (
            <Message
              key={message.id}
              message={message}
              grouped={continuesSender(room.messages[index - 1], message)}
              author={displayNameFor(peers, message.authorId, message.author, { clientId, name })}
            />
          ))}
        </ScrollView>
      )}
      <Composer
        audience={{ kind: "room", roomId: room.id }}
        dropped={dropped}
        droppedExtra={droppedExtra}
        onDropped={() => {
          setDropped(null);
          setDroppedExtra(0);
        }}
        onSend={(outgoing: OutgoingMessage) => {
          const message: RoomMessage = {
            id: outgoing.id,
            author: name,
            authorId: clientId,
            time: new Date(outgoing.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
            sentAt: outgoing.sentAt,
            body: outgoing.body,
            file: outgoing.file,
          };
          getTransport().publish({
            id: message.id,
            topic: "rooms",
            type: "message",
            sentAt: outgoing.sentAt,
            clientId,
            payload: { roomId: room.id, message },
          });
        }}
      />
      </FileDropSurface>
      {menuOpen ? (
        <RoomOptionsMenu
          onClose={() => setMenuOpen(false)}
          onRename={() => {
            setMenuOpen(false);
            setRenaming(true);
          }}
          onMembers={() => {
            setMenuOpen(false);
            setMembersOpen(true);
          }}
          onDelete={() => {
            setMenuOpen(false);
            setConfirming(true);
          }}
        />
      ) : null}
      {membersOpen ? (
        <MembersDialog
          room={room}
          onClose={() => setMembersOpen(false)}
          onChange={(memberIds) => {
            publishRooms("members", `members-${room.id}-${Date.now()}`, { roomId: room.id, memberIds });
          }}
        />
      ) : null}
      {renaming ? <RenameRoomDialog name={room.name} onClose={() => setRenaming(false)} onSave={rename} /> : null}
      {confirming ? (
        <DeleteRoomDialog
          name={room.name}
          onClose={() => setConfirming(false)}
          onDelete={() => {
            setConfirming(false);
            removeRoom(room.id);
          }}
        />
      ) : null}
    </View>
  );
}

function Message({ message, grouped, author }: { message: RoomMessage; grouped: boolean; author: string }) {
  const { clientId } = useSession();
  const mine = Boolean(clientId) && message.authorId === clientId;
  const attachmentOnly = Boolean(message.file) && !message.body?.trim();
  return (
    <View style={[styles.message, mine && styles.messageMine, grouped && styles.messageGrouped]}>
      {grouped ? null : (
        <View style={styles.messageMeta}>
          <Text style={styles.author}>{author}</Text>
          <Text style={styles.time}>{message.time}</Text>
        </View>
      )}
      {message.body?.trim() ? (
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
          <Text style={[styles.messageBody, columnTextStyle(message.body)]}>{message.body}</Text>
        </View>
      ) : null}
      {message.file ? <SharedFileCard file={message.file} solo={attachmentOnly} suggest={mine} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  split: {
    flexDirection: "row",
  },
  list: {
    minHeight: 0,
    minWidth: 0,
  },
  listFill: {
    flexGrow: 1,
    flexShrink: 1,
  },
  listSplit: {
    width: layout.roomListWidth,
    flexGrow: 0,
    flexShrink: 0,
    borderRightWidth: 1,
    borderRightColor: colors.line,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  alignedHeader: {
    height: 72,
    paddingVertical: 0,
    justifyContent: "center",
  },
  addRoom: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.burgundy,
    alignItems: "center",
    justifyContent: "center",
  },
  addRoomLabel: {
    ...font.ui,
    color: colors.youText,
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "500",
    marginTop: -1,
  },
  listContent: {
    paddingTop: 6,
    paddingBottom: 12,
  },
  presence: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    marginBottom: 4,
  },
  presenceNested: {
    paddingTop: 8,
    gap: 8,
  },
  presenceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 28,
    gap: 8,
  },
  presenceCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  presenceDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.online,
  },
  presenceDotOn: {
    backgroundColor: colors.online,
  },
  presenceDotOff: {
    backgroundColor: colors.faint,
  },
  mobileSection: {
    ...font.ui,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 6,
  },
  mobileEmpty: {
    ...font.content,
    color: colors.faint,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  presenceLabel: {
    ...font.content,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
  },
  avatars: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.navy,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarOverlap: {
    marginLeft: -7,
  },
  avatarLabel: {
    color: colors.youText,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "600",
  },
  avatarMore: {
    backgroundColor: colors.surfaceMuted,
  },
  avatarMoreLabel: {
    color: colors.ink,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "600",
  },
  presenceNames: {
    gap: 2,
  },
  presenceName: {
    ...font.ui,
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 62,
    marginHorizontal: 8,
    marginVertical: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
    position: "relative",
  },
  rowActive: {
    backgroundColor: colors.burgundySoft,
    borderColor: "rgba(122, 48, 64, 0.16)",
  },
  rowBar: {
    position: "absolute",
    left: 0,
    top: 14,
    bottom: 14,
    width: 2,
    borderRadius: 1,
    backgroundColor: colors.burgundy,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowName: {
    ...font.ui,
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  rowTime: {
    ...font.content,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },
  rowPreview: {
    ...font.content,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
  },
  glyphActive: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.burgundySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  newRoomForm: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  newRoomInput: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  createRoom: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  createRoomLabel: {
    color: colors.youText,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  deleteLabel: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  thread: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: colors.background,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  threadHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.background,
    gap: 8,
  },
  threadTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  threadTitle: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  threadName: {
    ...font.brand,
    flex: 1,
    fontWeight: "700",
  },
  memberCount: {
    ...font.content,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  overflowButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  overflowLabel: {
    ...font.ui,
    color: colors.ink,
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: 1,
    fontWeight: "600",
  },
  callButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: colors.navy,
  },
  callLabel: {
    ...font.ui,
    color: colors.youText,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  invite: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  inviteText: {
    ...font.content,
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
  },
  joinButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.background,
  },
  send: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: {
    opacity: 0.4,
  },
  sendLabel: {
    color: colors.youText,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  messages: {
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 18,
  },
  message: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
    maxWidth: 460,
    gap: 2,
  },
  messageMine: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  messageGrouped: {
    marginTop: -13,
  },
  messageMeta: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  author: {
    ...font.ui,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: colors.muted,
  },
  time: {
    ...font.content,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    color: colors.muted,
  },
  bubble: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "transparent",
    borderWidth: 1,
  },
  bubbleOther: {
    borderColor: colors.line,
  },
  bubbleMine: {
    borderColor: "rgba(122, 48, 64, 0.32)",
  },
  messageBody: {
    ...font.content,
    color: colors.navy,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
    textAlign: "left",
  },
  pressed: {
    opacity: 0.72,
  },
});
