import { useRef, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import type { PresencePeer } from "@/domain/types";
import { memberLabel } from "@/features/rooms/RoomDialogs";
import { webPointer } from "@/theme/pressable";
import { colors, font } from "@/theme/tokens";

const AVATAR_SIZE = 28;
const AVATAR_PALETTE = ["#B7A3CE", "#A5BBA1", "#E4C578", "#9DAFDA", "#DDA696", "#86B1AE"] as const;
const INITIALS_COLOR = colors.ink;

export function avatarColor(clientId: string) {
  let hash = 2166136261;
  for (let index = 0; index < clientId.length; index += 1) {
    hash ^= clientId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return AVATAR_PALETTE[(hash >>> 0) % AVATAR_PALETTE.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function photoUriFor(peer: PresencePeer) {
  const record = peer as PresencePeer & { photoUri?: unknown; avatarUrl?: unknown };
  const value = record.photoUri ?? record.avatarUrl;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function visibleMembers(members: PresencePeer[]) {
  if (members.length <= 4) {
    return { shown: members, extra: 0 };
  }
  return { shown: members.slice(0, 3), extra: members.length - 3 };
}

export function RoomMemberAvatars({ members, selfId }: { members: PresencePeer[]; selfId: string }) {
  const anchorRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState({ x: 16, y: 64 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const count = members.length;
  const { shown, extra } = visibleMembers(members);

  function openList() {
    setHoveredId(null);
    const node = anchorRef.current;
    if (!node) {
      setOpen(true);
      return;
    }
    node.measureInWindow((x, y, _width, height) => {
      setOrigin({ x, y: y + height + 8 });
      setOpen(true);
    });
  }

  const cardWidth = Math.min(280, windowWidth - 24);
  const left = Math.max(12, Math.min(origin.x, windowWidth - cardWidth - 12));
  const top = Math.min(Math.max(12, origin.y), Math.max(12, windowHeight - 160));
  const listMaxHeight = Math.max(120, Math.min(320, windowHeight - top - 72));

  return (
    <View style={styles.cluster}>
      {shown.length > 0 ? (
        <View ref={anchorRef} style={styles.stack}>
          {shown.map((member, index) => (
            <MemberAvatar
              key={member.clientId}
              member={member}
              index={index}
              hovered={hoveredId === member.clientId}
              onHover={(next) => setHoveredId(next ? member.clientId : null)}
              onPress={openList}
            />
          ))}
          {extra > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`+${extra} more members`}
              onPress={openList}
              style={({ pressed }) => [
                styles.avatar,
                styles.more,
                styles.overlap,
                { zIndex: hoveredId ? 1 : shown.length },
                webPointer,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.moreLabel}>+{extra}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.count}>{memberLabel(count)}</Text>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          <Pressable accessibilityLabel="Close members" style={styles.dismiss} onPress={() => setOpen(false)} />
          <View style={[styles.card, { top, left, width: cardWidth, maxHeight: listMaxHeight + 48 }]}>
            <Text style={styles.cardTitle}>{memberLabel(count)}</Text>
            <ScrollView style={{ maxHeight: listMaxHeight }} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
              {members.map((member) => (
                <View key={member.clientId} style={styles.row}>
                  <AvatarFace member={member} />
                  <Text style={styles.name} numberOfLines={1}>
                    {member.displayName}
                    {member.clientId === selfId ? " (you)" : ""}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MemberAvatar({
  member,
  index,
  hovered,
  onHover,
  onPress,
}: {
  member: PresencePeer;
  index: number;
  hovered: boolean;
  onHover: (active: boolean) => void;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={member.displayName}
      onPress={onPress}
      onHoverIn={() => onHover(true)}
      onHoverOut={() => onHover(false)}
      style={({ pressed }) => [
        styles.avatarSlot,
        index > 0 && styles.overlap,
        { zIndex: hovered ? 20 : index },
        webPointer,
        pressed && styles.pressed,
      ]}
    >
      <AvatarFace member={member} />
      {hovered ? (
        <View style={styles.tooltip} pointerEvents="none">
          <Text style={styles.tooltipText} numberOfLines={1}>
            {member.displayName}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function AvatarFace({ member }: { member: PresencePeer }) {
  const photo = photoUriFor(member);
  return (
    <View style={[styles.avatar, { backgroundColor: avatarColor(member.clientId) }]}>
      {photo ? (
        <Image accessibilityIgnoresInvertColors source={{ uri: photo }} style={styles.photo} />
      ) : (
        <Text style={styles.initials}>{initials(member.displayName)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  stack: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarSlot: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  overlap: {
    marginLeft: -8,
  },
  photo: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  initials: {
    ...font.ui,
    color: INITIALS_COLOR,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
  },
  more: {
    backgroundColor: colors.surface,
    zIndex: 4,
  },
  moreLabel: {
    ...font.ui,
    color: colors.ink,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
  },
  count: {
    ...font.content,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  pressed: {
    opacity: 0.72,
  },
  tooltip: {
    position: "absolute",
    top: AVATAR_SIZE + 6,
    left: -8,
    maxWidth: 180,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    zIndex: 30,
  },
  tooltipText: {
    ...font.ui,
    color: colors.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  modal: {
    flex: 1,
  },
  dismiss: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  card: {
    position: "absolute",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingTop: 12,
    paddingBottom: 8,
    shadowColor: colors.navy,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  cardTitle: {
    ...font.ui,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  list: {
    paddingBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 40,
  },
  name: {
    ...font.ui,
    flex: 1,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "500",
  },
});
