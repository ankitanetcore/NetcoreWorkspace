import { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { PhotoChooser } from "@/components/PhotoChooser";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { useSession } from "@/session/Session";
import type { ProfileInput } from "@/session/profile";
import { webPointer } from "@/theme/pressable";
import { colors, font } from "@/theme/tokens";

export function ProfileMenu({ anchor }: { anchor: "rail" | "bar" }) {
  const { name, title, location, photoUri, updateProfile } = useSession();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Profile, ${name}`}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [anchor === "rail" ? styles.youRail : styles.youBar, webPointer, pressed && styles.pressed]}
      >
        {anchor === "rail" ? (
          <>
            <View style={styles.avatar}>
              <ProfileAvatar name={name} photoUri={photoUri} size={36} backgroundColor={colors.navyRaised} color={colors.sidebarText} />
              <View style={styles.railDot} />
            </View>
            <Text style={styles.railName} numberOfLines={1}>
              {name}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.hiBar} numberOfLines={1}>
              Hi, {name}
            </Text>
            <View style={styles.statusRow}>
              <View style={[styles.onlineDot, styles.onlineDotBar]} />
              <Text style={styles.statusBar}>Online</Text>
            </View>
          </>
        )}
      </Pressable>
      {open ? (
        <ProfilePopover
          name={name}
          title={title}
          location={location}
          anchor={anchor}
          onClose={() => setOpen(false)}
          onEdit={() => {
            setOpen(false);
            setEditing(true);
          }}
        />
      ) : null}
      {editing ? (
        <EditProfileDialog
          name={name}
          title={title}
          location={location}
          photoUri={photoUri}
          onClose={() => setEditing(false)}
          onSave={(next) => {
            updateProfile(next);
            setEditing(false);
          }}
        />
      ) : null}
    </>
  );
}

function ProfilePopover({
  name,
  title,
  location,
  anchor,
  onClose,
  onEdit,
}: {
  name: string;
  title: string;
  location: string;
  anchor: "rail" | "bar";
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.layer}>
        <Pressable accessibilityLabel="Close profile" style={styles.dismiss} onPress={onClose} />
        <View style={anchor === "rail" ? styles.railCard : styles.barCard}>
          <Text style={styles.profileName} numberOfLines={1}>
            {name}
          </Text>
          {title || location ? (
            <Text style={styles.profileDetail} numberOfLines={2}>
              {[title, location].filter(Boolean).join(" · ")}
            </Text>
          ) : null}
          <View style={styles.statusRow}>
            <View style={[styles.onlineDot, styles.onlineDotCard]} />
            <Text style={styles.statusCard}>Online</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={onEdit}
            style={({ pressed }) => [styles.edit, webPointer, pressed && styles.pressed]}
          >
            <Text style={styles.editLabel}>Settings</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function EditProfileDialog({
  name,
  title,
  location,
  photoUri,
  onClose,
  onSave,
}: {
  name: string;
  title: string;
  location: string;
  photoUri: string;
  onClose: () => void;
  onSave: (profile: ProfileInput) => void;
}) {
  const [draftName, setDraftName] = useState(name);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftLocation, setDraftLocation] = useState(location);
  const [draftPhoto, setDraftPhoto] = useState(photoUri);
  const next = draftName.trim();

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable accessibilityLabel="Close" style={styles.dismiss} onPress={onClose} />
        <View style={styles.dialog}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.dialogContent}>
            <Text accessibilityRole="header" style={styles.dialogTitle}>
              Settings
            </Text>
            <Text style={styles.fieldLabel}>
              Your name <Text style={styles.required}>(Required)</Text>
            </Text>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              placeholder="e.g. Ankita"
              placeholderTextColor={colors.faint}
              autoFocus
              autoCapitalize="words"
              autoCorrect={false}
              accessibilityLabel="Your name"
              style={[styles.input, Platform.OS === "web" ? { outlineWidth: 0 } : null]}
            />
            <View style={styles.photoBlock}>
              <PhotoChooser name={draftName} photoUri={draftPhoto} onChange={setDraftPhoto} />
            </View>
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder="e.g. Developer Relations Engineer"
              placeholderTextColor={colors.faint}
              autoCapitalize="words"
              autoCorrect={false}
              accessibilityLabel="Title"
              style={[styles.input, Platform.OS === "web" ? { outlineWidth: 0 } : null]}
            />
            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput
              value={draftLocation}
              onChangeText={setDraftLocation}
              placeholder="e.g. New York, NY"
              placeholderTextColor={colors.faint}
              autoCapitalize="words"
              autoCorrect={false}
              accessibilityLabel="Location"
              style={[styles.input, Platform.OS === "web" ? { outlineWidth: 0 } : null]}
            />
            <View style={styles.actions}>
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
                accessibilityLabel="Save Changes"
                disabled={!next}
                onPress={() => onSave({ name: draftName, title: draftTitle, location: draftLocation, photoUri: draftPhoto })}
                style={({ pressed }) => [styles.save, !next && styles.disabled, webPointer, pressed && next ? styles.pressed : null]}
              >
                <Text style={styles.saveLabel}>Save Changes</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  youRail: {
    marginTop: "auto",
    alignItems: "center",
    gap: 6,
    width: 56,
  },
  youBar: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
    gap: 4,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.navyRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLabel: {
    color: colors.sidebarText,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  railDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.onlineOnNavy,
    borderWidth: 2,
    borderColor: colors.sidebar,
  },
  railName: {
    ...font.ui,
    color: colors.sidebarMuted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  hiBar: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  onlineDotBar: {
    backgroundColor: colors.online,
  },
  onlineDotCard: {
    backgroundColor: colors.online,
  },
  statusBar: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  layer: {
    flex: 1,
  },
  dismiss: {
    ...StyleSheet.absoluteFill,
  },
  railCard: {
    position: "absolute",
    left: 72,
    bottom: 16,
    width: 220,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  barCard: {
    position: "absolute",
    left: 16,
    top: 64,
    width: 220,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  profileName: {
    ...font.ui,
    color: colors.navy,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  statusCard: {
    ...font.content,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  edit: {
    alignSelf: "flex-start",
    minHeight: 32,
    justifyContent: "center",
  },
  editLabel: {
    ...font.ui,
    color: colors.burgundy,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
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
    maxWidth: 480,
    maxHeight: "88%",
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dialogContent: {
    padding: 20,
    gap: 8,
  },
  photoBlock: {
    marginTop: 8,
    marginBottom: 4,
  },
  required: {
    ...font.ui,
    color: colors.faint,
    fontWeight: "400",
  },
  profileDetail: {
    ...font.content,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  dialogTitle: {
    ...font.brand,
    color: colors.navy,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
  },
  fieldLabel: {
    ...font.ui,
    marginTop: 8,
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  input: {
    ...font.content,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    color: colors.ink,
    fontSize: 15,
    backgroundColor: colors.background,
  },
  actions: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
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
  save: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  saveLabel: {
    ...font.ui,
    color: colors.youText,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.72,
  },
});
