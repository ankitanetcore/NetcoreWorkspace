import { useEffect, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { PresencePeer, Room, RoomAccess } from "@/domain/types";
import { normalizeRoom } from "@/domain/membership";
import { useSession } from "@/session/Session";
import { createClientId } from "@/session/createClientId";
import { currentClientId } from "@/session/currentIdentity";
import { systemClientId } from "@/session/systemIdentity";
import { webPointer } from "@/theme/pressable";
import { colors, font, text } from "@/theme/tokens";
import { getTransport } from "@/transport";

export function publishRooms(type: string, id: string, payload: unknown) {
  getTransport().publish({
    id,
    topic: "rooms",
    type,
    sentAt: new Date().toISOString(),
    clientId: currentClientId() || undefined,
    payload,
  });
}

function readNamedPeers(): PresencePeer[] {
  return getTransport()
    .snapshot("presence")
    .peers.filter((peer) => peer.clientId !== systemClientId && peer.displayName.length > 0)
    .slice()
    .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.clientId.localeCompare(right.clientId));
}

export function useKnownPeers() {
  const { clientId, name, title, location, photoUri } = useSession();
  const [peers, setPeers] = useState(readNamedPeers);

  useEffect(() => {
    return getTransport().subscribe("presence", () => {
      setPeers(readNamedPeers());
    });
  }, []);

  const known = peers.map((peer) =>
    peer.clientId === clientId && name ? { ...peer, displayName: name, title, location, photoUri } : peer,
  );
  if (clientId && name && !known.some((peer) => peer.clientId === clientId)) {
    known.unshift({
      clientId,
      displayName: name,
      title,
      location,
      photoUri,
      status: "online",
      connectedAt: "",
    });
  }
  return known.sort((left, right) => left.displayName.localeCompare(right.displayName) || left.clientId.localeCompare(right.clientId));
}

export function memberCount(room: Room, peers: PresencePeer[]) {
  const next = normalizeRoom(room);
  if (next.access === "selected") {
    return next.memberIds.length;
  }
  return peers.length;
}

export function memberLabel(count: number) {
  return `${count} ${count === 1 ? "member" : "members"}`;
}

export function roomMembers(room: Room, peers: PresencePeer[], selfId: string, selfName: string) {
  const next = normalizeRoom(room);
  const members =
    next.access === "selected"
      ? next.memberIds.map((id) => describePeer(peers, id, selfId, selfName))
      : peers.slice();
  return members.sort(
    (left, right) => left.displayName.localeCompare(right.displayName) || left.clientId.localeCompare(right.clientId),
  );
}

function describePeer(peers: PresencePeer[], id: string, selfId: string, selfName: string): PresencePeer {
  const found = peers.find((peer) => peer.clientId === id);
  if (found) {
    return found;
  }
  return {
    clientId: id,
    displayName: id === selfId && selfName ? selfName : id.slice(0, 8),
    status: "offline",
    connectedAt: "",
  };
}

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable accessibilityLabel="Close" style={styles.scrimDismiss} onPress={onClose} />
        {children}
      </View>
    </Modal>
  );
}

function AccessChoice({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, webPointer, pressed && styles.pressed]}
    >
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      <View style={styles.choiceCopy}>
        <Text style={[text.label, font.ui]}>{label}</Text>
        <Text style={[text.meta, font.content]}>{detail}</Text>
      </View>
    </Pressable>
  );
}

function PeerCheck({
  label,
  checked,
  disabled,
  onPress,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.peerCheck, webPointer, pressed && !disabled && styles.pressed]}
    >
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked ? <Text style={styles.boxMark}>✓</Text> : null}
      </View>
      <Text style={[styles.peerCheckLabel, disabled && styles.peerCheckDisabled]}>{label}</Text>
    </Pressable>
  );
}

export function CreateRoomDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (roomId: string) => void;
}) {
  const { clientId } = useSession();
  const peers = useKnownPeers();
  const [draft, setDraft] = useState("");
  const [access, setAccess] = useState<RoomAccess>("everyone");
  const [picked, setPicked] = useState<string[]>(clientId ? [clientId] : []);
  const roomName = draft.trim();
  const selectedIds =
    access === "selected" ? Array.from(new Set([clientId, ...picked].filter((id): id is string => Boolean(id)))) : [];

  function toggle(id: string) {
    if (id === clientId) {
      return;
    }
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function create() {
    if (!roomName) {
      return;
    }
    const room = {
      id: `room-${createClientId()}`,
      name: roomName,
      messages: [],
      access,
      memberIds: access === "selected" ? selectedIds : [],
    };
    publishRooms("create", room.id, { room });
    onCreated(room.id);
  }

  return (
    <Overlay onClose={onClose}>
      <View style={styles.dialog}>
        <ScrollView contentContainerStyle={styles.dialogBody} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={[text.title, font.brand, styles.brandTitle]}>
            Create Room
          </Text>
          <Text style={styles.fieldLabel}>Room name</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={create}
            autoFocus
            placeholder="Room name"
            placeholderTextColor={colors.faint}
            accessibilityLabel="Room name"
            style={styles.input}
          />
          <Text style={styles.fieldLabel}>Who can access this room?</Text>
          <AccessChoice
            label="Everyone"
            detail="Everyone in this workspace can access this room"
            selected={access === "everyone"}
            onPress={() => setAccess("everyone")}
          />
          <AccessChoice
            label="Select people"
            detail="Choose specific workspace members"
            selected={access === "selected"}
            onPress={() => setAccess("selected")}
          />
          {access === "selected" ? (
            <View style={styles.people}>
              <Text style={styles.fieldLabel}>Select people</Text>
              {peers.map((peer) => {
                const you = peer.clientId === clientId;
                return (
                  <PeerCheck
                    key={peer.clientId}
                    label={you ? `${peer.displayName} (you)` : peer.displayName}
                    checked={selectedIds.includes(peer.clientId)}
                    disabled={you}
                    onPress={() => toggle(peer.clientId)}
                  />
                );
              })}
              <Text style={[text.meta, font.content]}>
                {selectedIds.length} {selectedIds.length === 1 ? "person" : "people"} selected
              </Text>
            </View>
          ) : null}
        </ScrollView>
        <View style={styles.dialogActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={onClose}
            style={({ pressed }) => [styles.textButton, webPointer, pressed && styles.pressed]}
          >
            <Text style={styles.textButtonLabel}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create Room"
            disabled={!roomName}
            onPress={create}
            style={({ pressed }) => [
              styles.primaryButton,
              !roomName && styles.disabled,
              webPointer,
              pressed && roomName ? styles.pressed : null,
            ]}
          >
            <Text style={styles.primaryLabel}>Create Room</Text>
          </Pressable>
        </View>
      </View>
    </Overlay>
  );
}

export function RoomOptionsMenu({
  onClose,
  onRename,
  onMembers,
  onDelete,
}: {
  onClose: () => void;
  onRename: () => void;
  onMembers: () => void;
  onDelete: () => void;
}) {
  return (
    <Overlay onClose={onClose}>
      <View style={styles.menu}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Rename Room"
          onPress={onRename}
          style={({ pressed }) => [styles.menuItem, webPointer, pressed && styles.pressed]}
        >
          <Text style={styles.menuLabel}>Rename Room</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Manage Members"
          onPress={onMembers}
          style={({ pressed }) => [styles.menuItem, webPointer, pressed && styles.pressed]}
        >
          <Text style={styles.menuLabel}>Manage Members</Text>
        </Pressable>
        <View style={styles.menuDivider} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete Room"
          onPress={onDelete}
          style={({ pressed }) => [styles.menuItem, webPointer, pressed && styles.pressed]}
        >
          <Text style={styles.menuDanger}>Delete Room</Text>
        </Pressable>
      </View>
    </Overlay>
  );
}

export function MembersDialog({
  room,
  onClose,
  onChange,
}: {
  room: Room;
  onClose: () => void;
  onChange: (memberIds: string[]) => void;
}) {
  const { clientId, name } = useSession();
  const peers = useKnownPeers();
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const next = normalizeRoom(room);
  const selected = next.access === "selected";
  const memberIds = selected
    ? next.memberIds
    : Array.from(new Set([clientId, ...peers.map((peer) => peer.clientId)].filter((id): id is string => Boolean(id))));
  const members = (selected ? next.memberIds.map((id) => describePeer(peers, id, clientId, name)) : peers.slice()).sort(
    (left, right) => {
      if (left.status !== right.status) {
        return left.status === "online" ? -1 : 1;
      }
      return left.displayName.localeCompare(right.displayName) || left.clientId.localeCompare(right.clientId);
    },
  );
  const candidates = peers.filter((peer) => !memberIds.includes(peer.clientId));

  function toggle(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function add() {
    if (picked.length === 0) {
      return;
    }
    onChange(Array.from(new Set([...memberIds, ...picked])));
    setPicked([]);
    setAdding(false);
  }

  function remove(id: string) {
    if (!id || id === clientId) {
      return;
    }
    onChange(memberIds.filter((item) => item !== id));
  }

  return (
    <Overlay onClose={onClose}>
      <View style={styles.dialog}>
        <ScrollView contentContainerStyle={styles.dialogBody} keyboardShouldPersistTaps="handled">
          <View style={styles.membersHeader}>
            <Text accessibilityRole="header" style={[text.title, font.brand, styles.brandTitle, styles.membersTitle]}>
              {adding ? "Add people" : `${room.name} members`}
            </Text>
            {adding ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add a person"
                onPress={() => setAdding(true)}
                style={({ pressed }) => [webPointer, pressed && styles.pressed]}
              >
                <Text style={styles.addPerson}>+</Text>
              </Pressable>
            )}
          </View>
          {adding ? (
            <View style={styles.people}>
              {candidates.length === 0 ? <Text style={[text.meta, font.content]}>No one else to add.</Text> : null}
              {candidates.map((peer) => (
                <PeerCheck
                  key={peer.clientId}
                  label={peer.displayName}
                  checked={picked.includes(peer.clientId)}
                  onPress={() => toggle(peer.clientId)}
                />
              ))}
              <Text style={[text.meta, font.content]}>
                {picked.length} {picked.length === 1 ? "person" : "people"} selected
              </Text>
            </View>
          ) : (
            <View style={styles.people}>
              {selected ? null : (
                <Text style={[text.meta, font.content]}>Everyone in this workspace has access to this Room.</Text>
              )}
              {members.map((peer) => {
                const you = peer.clientId === clientId;
                const online = peer.status === "online";
                return (
                  <View key={peer.clientId} style={styles.memberBlock}>
                    <View style={styles.memberRow}>
                      <View style={[styles.dot, online ? styles.dotOn : styles.dotOff]} />
                      <Text style={styles.memberName} numberOfLines={1}>
                        {peer.displayName}
                        {you ? " (you)" : ""}
                      </Text>
                      {you ? null : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${peer.displayName}`}
                          onPress={() => remove(peer.clientId)}
                          style={({ pressed }) => [styles.removeAction, webPointer, pressed && styles.pressed]}
                        >
                          <Text style={styles.removeLabel}>Remove</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
        {adding ? (
          <View style={styles.dialogActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={() => {
                setPicked([]);
                setAdding(false);
              }}
              style={({ pressed }) => [styles.textButton, webPointer, pressed && styles.pressed]}
            >
              <Text style={styles.textButtonLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add"
              disabled={picked.length === 0}
              onPress={add}
              style={({ pressed }) => [
                styles.primaryButton,
                picked.length === 0 && styles.disabled,
                webPointer,
                pressed && picked.length > 0 ? styles.pressed : null,
              ]}
            >
              <Text style={styles.primaryLabel}>Add</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Overlay>
  );
}

export function RenameRoomDialog({
  name,
  onClose,
  onSave,
}: {
  name: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  const next = draft.trim();

  return (
    <Overlay onClose={onClose}>
      <View style={styles.dialog}>
        <View style={styles.dialogBody}>
          <Text accessibilityRole="header" style={[text.title, font.brand, styles.brandTitle]}>
            Rename Room
          </Text>
          <Text style={styles.fieldLabel}>Room name</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => onSave(next)}
            autoFocus
            placeholder="Room name"
            placeholderTextColor={colors.faint}
            accessibilityLabel="Room name"
            style={styles.input}
          />
        </View>
        <View style={styles.dialogActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={onClose}
            style={({ pressed }) => [styles.textButton, webPointer, pressed && styles.pressed]}
          >
            <Text style={styles.textButtonLabel}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save"
            disabled={!next}
            onPress={() => onSave(next)}
            style={({ pressed }) => [
              styles.primaryButton,
              !next && styles.disabled,
              webPointer,
              pressed && next ? styles.pressed : null,
            ]}
          >
            <Text style={styles.primaryLabel}>Save</Text>
          </Pressable>
        </View>
      </View>
    </Overlay>
  );
}

export function DeleteRoomDialog({
  name,
  onClose,
  onDelete,
}: {
  name: string;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <Overlay onClose={onClose}>
      <View style={styles.dialog}>
        <View style={styles.dialogBody}>
          <Text accessibilityRole="header" style={[text.title, font.brand, styles.brandTitle]}>
            Delete "{name}"?
          </Text>
          <Text style={[text.body, font.content]}>This will remove the Room and its current session history.</Text>
        </View>
        <View style={styles.dialogActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={onClose}
            style={({ pressed }) => [styles.textButton, webPointer, pressed && styles.pressed]}
          >
            <Text style={styles.textButtonLabel}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete Room"
            onPress={onDelete}
            style={({ pressed }) => [styles.dangerButton, webPointer, pressed && styles.pressed]}
          >
            <Text style={styles.primaryLabel}>Delete Room</Text>
          </Pressable>
        </View>
      </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(20, 32, 51, 0.28)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  scrimDismiss: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  dialog: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "80%",
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    zIndex: 1,
  },
  dialogBody: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 10,
  },
  dialogActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  fieldLabel: {
    ...font.ui,
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    marginTop: 6,
  },
  input: {
    ...font.content,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.background,
  },
  choice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 6,
  },
  choiceCopy: {
    flex: 1,
    gap: 2,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.faint,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  radioOn: {
    borderColor: colors.burgundy,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.burgundy,
  },
  people: {
    gap: 4,
  },
  peerCheck: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 36,
  },
  box: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.faint,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  boxOn: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  boxMark: {
    ...font.ui,
    color: colors.youText,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "600",
  },
  peerCheckLabel: {
    ...font.ui,
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  peerCheckDisabled: {
    color: colors.muted,
  },
  textButton: {
    minHeight: 40,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  textButtonLabel: {
    ...font.ui,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  primaryButton: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerButton: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.burgundy,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryLabel: {
    ...font.ui,
    color: colors.youText,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.4,
  },
  menu: {
    width: "100%",
    maxWidth: 240,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 6,
    zIndex: 1,
  },
  menuItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  menuLabel: {
    ...font.ui,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "500",
  },
  menuDanger: {
    ...font.ui,
    color: colors.burgundy,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: 4,
  },
  memberBlock: {
    gap: 2,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 32,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotOn: {
    backgroundColor: colors.online,
  },
  dotOff: {
    backgroundColor: colors.faint,
  },
  membersHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  membersTitle: {
    flex: 1,
  },
  brandTitle: {
    fontWeight: "700",
  },
  addPerson: {
    ...font.ui,
    color: colors.burgundy,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "600",
    paddingHorizontal: 4,
  },
  memberName: {
    ...font.ui,
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
  },
  removeAction: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  removeLabel: {
    ...font.ui,
    color: colors.burgundy,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.72,
  },
});
