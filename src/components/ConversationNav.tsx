import { useRouter, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ProfileAvatar } from "@/components/ProfileAvatar";
import { canAccessRoom, normalizeRoom } from "@/domain/membership";
import type { DirectThread, Room, RoomMessage } from "@/domain/types";
import { readDirectThreads } from "@/features/direct/direct";
import { selectDirect, selectRoom, useConversationSelection } from "@/features/messages/selection";
import { channelMessages, previewText } from "@/features/messages/preview";
import { sentDay } from "@/features/messages/sentWhen";
import { unreadCount, useReadVersion } from "@/features/messages/readState";
import { CreateRoomDialog, useKnownPeers } from "@/features/rooms/RoomDialogs";
import { displayNameFor } from "@/session/displayName";
import { useSession } from "@/session/Session";
import { currentClientId } from "@/session/currentIdentity";
import { webMotion, webPointer } from "@/theme/pressable";
import { colors, font } from "@/theme/tokens";
import { getTransport } from "@/transport";

function readRooms(): Room[] {
  const clientId = currentClientId();
  return getTransport()
    .snapshot("rooms")
    .rooms.map((room) => normalizeRoom(room))
    .filter((room) => canAccessRoom(room, clientId));
}

export function ConversationNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { clientId, name } = useSession();
  const selection = useConversationSelection();
  useReadVersion();
  const peers = useKnownPeers();
  const [rooms, setRooms] = useState(readRooms);
  const [threads, setThreads] = useState(readDirectThreads);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const onRooms = pathname === "/rooms" || pathname.startsWith("/rooms/");
  const needle = query.trim().toLowerCase();

  useEffect(() => {
    const refresh = () => {
      setRooms(readRooms());
      setThreads(readDirectThreads());
    };
    const stopRooms = getTransport().subscribe("rooms", refresh);
    const stopDirect = getTransport().subscribe("direct", refresh);
    return () => {
      stopRooms();
      stopDirect();
    };
  }, []);

  function openRoom(id: string) {
    selectRoom(id);
    if (!onRooms) {
      router.push("/rooms");
    }
  }

  function openDirect(peerId: string) {
    selectDirect(peerId);
    if (!onRooms) {
      router.push("/rooms");
    }
  }

  const recent = threads
    .map((thread) => ({ thread, peerId: thread.participantIds.find((id) => id !== clientId) ?? "" }))
    .filter((item) => item.peerId)
    .sort((left, right) => lastActivity(right.thread) - lastActivity(left.thread));
  const visibleRooms = rooms.filter((room) => matchesConversation(room.name, room.messages, needle));
  const visibleRecent = recent.filter(({ thread, peerId }) => {
    const peer = peers.find((item) => item.clientId === peerId);
    return matchesConversation(peer?.displayName || peerId, thread.messages, needle);
  });

  return (
    <>
      <View style={styles.headingBlock}>
        <Text accessibilityRole="header" style={styles.heading}>
          Chat
        </Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search messages"
          placeholderTextColor={colors.sidebarMuted}
          accessibilityLabel="Search messages"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.search}
        />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Rooms</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New Room"
              onPress={() => setCreating(true)}
              style={({ pressed }) => [webPointer, pressed && styles.pressed]}
            >
              <Text style={styles.add}>+</Text>
            </Pressable>
          </View>
          {visibleRooms.length === 0 ? <Text style={styles.empty}>No matches</Text> : null}
          {visibleRooms.map((room) => {
            const last = previewMessage(room.messages, needle);
            const unread = unreadCount(room.id, room.messages, clientId);
            const active = onRooms && selection?.kind === "room" && selection.id === room.id;
            return (
              <Pressable
                key={room.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => openRoom(room.id)}
                style={({ pressed, hovered }) => [
                  styles.row,
                  active && styles.rowActive,
                  hovered && !active ? styles.rowHover : null,
                  webPointer,
                  webMotion,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.iconChip, { backgroundColor: roomTone(room.id).bg }]}>
                  <Text style={[styles.roomLetter, { color: roomTone(room.id).icon }]}>
                    {room.name.trim().charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
                <View style={styles.copy}>
                  <View style={styles.titleLine}>
                    <Text style={[styles.name, active && styles.nameActive, unread > 0 && styles.nameUnread]} numberOfLines={1}>
                      {room.name}
                    </Text>
                    <SentWhen sentAt={last?.sentAt} />
                  </View>
                  <Text style={[styles.preview, unread > 0 && styles.previewUnread]} numberOfLines={1}>
                    {last ? `${displayNameFor(peers, last.authorId, last.author, { clientId, name })}: ${previewText(last)}` : "No messages yet"}
                  </Text>
                </View>
                {unread > 0 ? <Text style={styles.badge}>{unread > 9 ? "9+" : unread}</Text> : null}
              </Pressable>
            );
          })}
        </View>
        <View style={[styles.section, styles.directSection]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Direct Messages</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New message"
              onPress={() => router.push("/people")}
              style={({ pressed }) => [webPointer, pressed && styles.pressed]}
            >
              <Text style={styles.add}>+</Text>
            </Pressable>
          </View>
          {visibleRecent.length === 0 ? (
            <Text style={styles.empty}>{needle ? "No matches" : "No conversations yet"}</Text>
          ) : null}
          {visibleRecent.map(({ thread, peerId }) => {
            const peer = peers.find((item) => item.clientId === peerId);
            const last = previewMessage(thread.messages, needle);
            const unread = unreadCount(thread.id, thread.messages, clientId);
            const active = onRooms && selection?.kind === "direct" && selection.peerId === peerId;
            return (
              <Pressable
                key={thread.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => openDirect(peerId)}
                style={({ pressed, hovered }) => [
                  styles.row,
                  active && styles.rowActive,
                  hovered && !active ? styles.rowHover : null,
                  webPointer,
                  webMotion,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.avatar}>
                  <ProfileAvatar
                    name={peer?.displayName || ""}
                    photoUri={peer?.photoUri}
                    size={22}
                    backgroundColor="#3A2E32"
                    color="#E4C8CB"
                  />
                  <View style={[styles.presence, peer?.status === "online" ? styles.dotOnline : styles.dotOffline]} />
                </View>
                <View style={styles.copy}>
                  <View style={styles.titleLine}>
                    <Text style={[styles.name, active && styles.nameActive, unread > 0 && styles.nameUnread]} numberOfLines={1}>
                      {peer?.displayName || peerId.slice(0, 8)}
                    </Text>
                    <SentWhen sentAt={last?.sentAt} />
                  </View>
                  <Text style={[styles.preview, unread > 0 && styles.previewUnread]} numberOfLines={1}>
                    {last ? previewText(last) : "No messages yet"}
                  </Text>
                </View>
                {unread > 0 ? <Text style={styles.badge}>{unread > 9 ? "9+" : unread}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      {creating ? (
        <CreateRoomDialog
          onClose={() => setCreating(false)}
          onCreated={(roomId) => {
            setCreating(false);
            openRoom(roomId);
          }}
        />
      ) : null}
    </>
  );
}

const roomTones = [
  { bg: "#3A2E32", icon: "#E4C8CB" },
  { bg: "#24362E", icon: "#C9D9CF" },
  { bg: "#2C3342", icon: "#C9D2E0" },
  { bg: "#3A342C", icon: "#E4D6C4" },
];

function roomTone(id: string) {
  let hash = 0;
  for (const char of id) {
    hash = (hash + char.charCodeAt(0)) % roomTones.length;
  }
  return roomTones[hash];
}

function matchesConversation(label: string, messages: RoomMessage[], needle: string) {
  if (!needle) {
    return true;
  }
  if (label.toLowerCase().includes(needle)) {
    return true;
  }
  return messages.some((message) => previewText(message).toLowerCase().includes(needle));
}

function previewMessage(messages: RoomMessage[], needle: string) {
  if (needle) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (previewText(message).toLowerCase().includes(needle)) {
        return message;
      }
    }
  }
  const visible = channelMessages(messages);
  for (let index = visible.length - 1; index >= 0; index -= 1) {
    return visible[index];
  }
  return undefined;
}

function lastActivity(thread: DirectThread) {
  const last = thread.messages[thread.messages.length - 1];
  const sent = last?.sentAt ? Date.parse(last.sentAt) : 0;
  return Number.isNaN(sent) ? 0 : sent;
}

function SentWhen({ sentAt }: { sentAt?: string }) {
  const label = sentDay(sentAt);
  if (!label) {
    return null;
  }
  return <Text style={styles.when} numberOfLines={1}>{label}</Text>;
}

const styles = StyleSheet.create({
  headingBlock: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  heading: {
    ...font.brand,
    color: colors.sidebarText,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
  },
  search: {
    ...font.content,
    minHeight: 32,
    borderRadius: 8,
    paddingHorizontal: 8,
    backgroundColor: colors.navyRaised,
    color: colors.sidebarText,
    fontSize: 12,
    fontWeight: "400",
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  section: {
    gap: 2,
  },
  directSection: {
    marginTop: 16,
  },
  sectionHeader: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sectionLabel: {
    ...font.ui,
    color: colors.sidebarMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  add: {
    ...font.ui,
    color: colors.burgundy,
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "600",
    paddingHorizontal: 4,
  },
  row: {
    minHeight: 52,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowHover: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  rowActive: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  iconChip: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  roomLetter: {
    ...font.ui,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "700",
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#3A2E32",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLabel: {
    ...font.ui,
    color: "#E4C8CB",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
  },
  presence: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.navy,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  name: {
    ...font.ui,
    flexShrink: 1,
    color: colors.sidebarText,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  nameActive: {
    color: colors.sidebarText,
  },
  nameUnread: {
    fontWeight: "600",
  },
  when: {
    ...font.content,
    flexShrink: 0,
    marginLeft: "auto",
    color: colors.sidebarMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "400",
  },
  preview: {
    ...font.content,
    color: colors.sidebarMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },
  previewUnread: {
    color: "#D5DCE6",
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    overflow: "hidden",
    paddingHorizontal: 5,
    backgroundColor: colors.burgundy,
    ...font.ui,
    color: colors.youText,
    fontSize: 11,
    lineHeight: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotOnline: {
    backgroundColor: colors.onlineOnNavy,
  },
  dotOffline: {
    backgroundColor: colors.sidebarMuted,
  },
  empty: {
    ...font.content,
    color: colors.sidebarMuted,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  pressed: {
    opacity: 0.86,
  },
});
