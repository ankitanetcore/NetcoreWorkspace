import { useRouter, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { GeometricIcon } from "@/components/GeometricIcon";
import type { WorkspaceFolder } from "@/domain/types";
import { createFolder } from "@/features/files/fileActions";
import { selectFolder, useSelectedFolder } from "@/features/files/folderSelection";
import { webMotion, webPointer } from "@/theme/pressable";
import { colors, text } from "@/theme/tokens";
import { getTransport } from "@/transport";

function readFolders(): WorkspaceFolder[] {
  return getTransport()
    .snapshot("files")
    .folders.map((folder) => ({
      ...folder,
      files: folder.files.map((file) => ({ ...file })),
    }));
}

function fileCount(count: number) {
  return count === 1 ? "1 file" : `${count} files`;
}

export function FolderNav() {
  const router = useRouter();
  const pathname = usePathname();
  const selectedId = useSelectedFolder();
  const [folders, setFolders] = useState(readFolders);
  const [creating, setCreating] = useState(false);
  const onFiles = pathname === "/files" || pathname.startsWith("/files/");

  useEffect(() => {
    return getTransport().subscribe("files", () => {
      setFolders(readFolders());
    });
  }, []);

  function openFolder(id: string) {
    selectFolder(id);
    if (!onFiles) {
      router.push("/files");
    }
  }

  return (
    <>
      <View style={styles.header}>
        <Text style={styles.sectionLabel}>Folders</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New folder"
          onPress={() => setCreating(true)}
          style={({ pressed }) => [webPointer, pressed && styles.pressed]}
        >
          <Text style={styles.add}>+</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {folders.map((folder) => {
          const active = onFiles && folder.id === selectedId;
          return (
            <Pressable
              key={folder.id}
              accessibilityRole="button"
              accessibilityLabel={`${folder.name}, ${fileCount(folder.files.length)}`}
              accessibilityState={{ selected: active }}
              onPress={() => openFolder(folder.id)}
              style={({ pressed, hovered }) => [
                styles.row,
                active && styles.rowActive,
                hovered && !active ? styles.rowHover : null,
                webPointer,
                webMotion,
                pressed && styles.pressed,
              ]}
            >
              <GeometricIcon name="folder" size={16} color={active ? colors.sidebarText : colors.sidebarMuted} />
              <Text style={styles.name} numberOfLines={1}>
                {folder.name}
              </Text>
              <Text style={styles.count}>{fileCount(folder.files.length)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {creating ? (
        <NewFolderDialog
          onClose={() => setCreating(false)}
          onSave={(name) => {
            const id = createFolder(name);
            setCreating(false);
            if (id) {
              openFolder(id);
            }
          }}
        />
      ) : null}
    </>
  );
}

function NewFolderDialog({ onClose, onSave }: { onClose: () => void; onSave: (name: string) => void }) {
  const [draft, setDraft] = useState("");
  const name = draft.trim();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable accessibilityLabel="Close" style={styles.scrimDismiss} onPress={onClose} />
        <View style={styles.dialog}>
          <Text accessibilityRole="header" style={text.title}>
            New Folder
          </Text>
          <Text style={styles.note}>This folder is added at the top level, next to your other folders.</Text>
          <Text style={styles.fieldLabel}>Folder name</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => {
              if (name) {
                onSave(name);
              }
            }}
            autoFocus
            placeholder="Folder name"
            placeholderTextColor={colors.faint}
            accessibilityLabel="Folder name"
            style={styles.nameInput}
          />
          <View style={styles.dialogActions}>
            <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.cancel, webPointer, pressed && styles.pressed]}>
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create"
              disabled={!name}
              onPress={() => onSave(name)}
              style={({ pressed }) => [styles.save, !name && styles.saveDisabled, webPointer, pressed && name ? styles.pressed : null]}
            >
              <Text style={styles.saveLabel}>Create</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 8,
    minHeight: 32,
  },
  sectionLabel: {
    color: colors.sidebarMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  add: {
    color: colors.burgundy,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: "600",
    paddingHorizontal: 4,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    paddingHorizontal: 8,
    paddingBottom: 16,
    gap: 8,
  },
  row: {
    height: 40,
    borderRadius: 8,
    marginHorizontal: 8,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowHover: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  rowActive: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  name: {
    flex: 1,
    minWidth: 0,
    color: colors.sidebarText,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  count: {
    color: colors.sidebarMuted,
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 0,
  },
  pressed: {
    opacity: 0.72,
  },
  scrim: {
    flex: 1,
    backgroundColor: "rgba(20, 32, 51, 0.4)",
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
    maxWidth: 380,
    zIndex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  note: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  fieldLabel: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  nameInput: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.background,
    color: colors.ink,
    fontSize: 15,
  },
  dialogActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 8,
  },
  cancel: {
    minHeight: 36,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelLabel: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  save: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.burgundy,
    alignItems: "center",
    justifyContent: "center",
  },
  saveDisabled: {
    opacity: 0.4,
  },
  saveLabel: {
    color: colors.youText,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
});
