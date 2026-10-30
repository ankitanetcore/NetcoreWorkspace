import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ProfileAvatar } from "@/components/ProfileAvatar";
import { SearchIcon } from "@/components/SearchIcon";
import type { PresencePeer } from "@/domain/types";
import { selectDirect } from "@/features/messages/selection";
import { useKnownPeers } from "@/features/rooms/RoomDialogs";
import { useSession } from "@/session/Session";
import { webPointer } from "@/theme/pressable";
import { colors } from "@/theme/tokens";

type PresenceFilter = "all" | "online" | "offline";

const filters: { id: PresenceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "online", label: "Online" },
  { id: "offline", label: "Offline" },
];

export function PeopleScreen() {
  const peers = useKnownPeers();
  const { clientId } = useSession();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PresenceFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const onlineCount = peers.filter((peer) => peer.status === "online").length;
  const needle = query.trim().toLowerCase();
  const visible = peers
    .filter((peer) => filter === "all" || peer.status === filter)
    .filter((peer) => !needle || peer.displayName.toLowerCase().includes(needle))
    .slice()
    .sort((left, right) => {
      const leftYou = left.clientId === clientId;
      const rightYou = right.clientId === clientId;
      if (leftYou !== rightYou) {
        return leftYou ? -1 : 1;
      }
      if (left.status !== right.status) {
        return left.status === "online" ? -1 : 1;
      }
      return left.displayName.localeCompare(right.displayName) || left.clientId.localeCompare(right.clientId);
    });
  const filterLabel = filters.find((item) => item.id === filter)?.label ?? "All";

  function openDirect(peerId: string) {
    selectDirect(peerId);
    router.push("/rooms");
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Text accessibilityRole="header" style={styles.title}>
            People
          </Text>
          <Text style={styles.subtitle}>Your workspace members</Text>
          <View style={[styles.search, searchFocused && styles.searchFocused]}>
            <SearchIcon />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search members..."
              placeholderTextColor={colors.faint}
              accessibilityLabel="Search members"
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              style={[styles.searchInput, Platform.OS === "web" ? { outlineWidth: 0 } : null]}
            />
          </View>
          <View style={styles.toolbar}>
            <Text style={styles.summary}>
              {memberCount(peers.length)} · {onlineCount === 1 ? "1 online" : `${onlineCount} online`}
            </Text>
            <View style={styles.filterWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Filter members, ${filterLabel}`}
                accessibilityState={{ expanded: filterOpen }}
                onPress={() => setFilterOpen((open) => !open)}
                style={({ pressed }) => [styles.filter, webPointer, pressed && styles.pressed]}
              >
                <Text style={styles.filterLabel}>
                  {filterLabel} ▾
                </Text>
              </Pressable>
              {filterOpen ? (
                <View style={styles.menu}>
                  {filters.map((item) => (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: item.id === filter }}
                      onPress={() => {
                        setFilter(item.id);
                        setFilterOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.menuItem,
                        item.id === filter && styles.menuItemSelected,
                        webPointer,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.menuLabel, item.id === filter && styles.menuLabelSelected]}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.list}>
            {visible.map((peer, index) => (
              <PersonRow
                key={peer.clientId}
                peer={peer}
                you={peer.clientId === clientId}
                last={index === visible.length - 1}
                onMessage={peer.clientId === clientId ? undefined : () => openDirect(peer.clientId)}
              />
            ))}
            {visible.length === 0 ? <Text style={styles.empty}>{emptyLabel(peers.length, needle, filter)}</Text> : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function memberCount(count: number) {
  return count === 1 ? "1 member" : `${count} members`;
}

function emptyLabel(total: number, needle: string, filter: PresenceFilter) {
  if (total === 0) {
    return "No members yet.";
  }
  if (needle) {
    return "No members match that name.";
  }
  if (filter === "online") {
    return "No members are online.";
  }
  if (filter === "offline") {
    return "No members are offline.";
  }
  return "No members match.";
}

function PersonRow({
  peer,
  you,
  last,
  onMessage,
}: {
  peer: PresencePeer;
  you: boolean;
  last: boolean;
  onMessage?: () => void;
}) {
  const online = peer.status === "online";
  const detail = [peer.title, peer.location].filter(Boolean).join(" · ");

  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={styles.avatarWrap}>
        <ProfileAvatar
          name={peer.displayName}
          photoUri={peer.photoUri}
          size={40}
          backgroundColor={colors.burgundySoft}
          color={colors.burgundy}
        />
        <View style={[styles.statusDot, online ? styles.statusOnline : styles.statusOffline]} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.name} numberOfLines={1}>
          {peer.displayName}
          {you ? " (you)" : ""}
        </Text>
        <Text style={styles.status} numberOfLines={1}>
          {detail || (online ? "Online" : "Offline")}
        </Text>
      </View>
      {onMessage ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Message ${peer.displayName}`}
          onPress={onMessage}
          style={({ pressed }) => [styles.message, webPointer, pressed && styles.pressed]}
        >
          <Text style={styles.messageLabel}>Message</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.canvas,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 40,
  },
  column: {
    width: "100%",
    maxWidth: 920,
    alignSelf: "center",
  },
  title: {
    color: colors.navy,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "600",
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 18,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  search: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  searchFocused: {
    borderColor: "rgba(122, 48, 64, 0.4)",
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    paddingVertical: 0,
    color: colors.ink,
    fontSize: 15,
  },
  toolbar: {
    marginTop: 16,
    marginBottom: 12,
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    zIndex: 2,
  },
  summary: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  filterWrap: {
    position: "relative",
  },
  filter: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  filterLabel: {
    color: colors.navy,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  menu: {
    position: "absolute",
    top: 36,
    right: 0,
    minWidth: 140,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.surface,
    overflow: "hidden",
    zIndex: 3,
  },
  menuItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  menuItemSelected: {
    backgroundColor: colors.burgundySoft,
  },
  menuLabel: {
    color: colors.navy,
    fontSize: 14,
    lineHeight: 18,
  },
  menuLabelSelected: {
    color: colors.burgundy,
    fontWeight: "600",
  },
  list: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  avatarWrap: {
    width: 40,
    height: 40,
    flexShrink: 0,
  },
  statusDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  statusOnline: {
    backgroundColor: colors.online,
  },
  statusOffline: {
    backgroundColor: colors.faint,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    color: colors.navy,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  status: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  message: {
    flexShrink: 0,
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(122, 48, 64, 0.35)",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  messageLabel: {
    color: colors.burgundy,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  empty: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  pressed: {
    opacity: 0.72,
  },
});
