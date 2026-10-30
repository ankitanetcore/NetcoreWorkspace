import { useRouter, usePathname } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { GeometricIcon } from "@/components/GeometricIcon";
import type { WorkspaceFolder } from "@/domain/types";
import { createFolder, reorderFolders } from "@/features/files/fileActions";
import { expandFolders, toggleFolderExpanded, useExpandedFolders } from "@/features/files/folderExpansion";
import { selectFolder, useSelectedFolder } from "@/features/files/folderSelection";
import { childFolders, folderChain, folderParentId } from "@/features/files/folderTree";
import { webMotion, webPointer } from "@/theme/pressable";
import { colors, font, text } from "@/theme/tokens";
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
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; place: "before" | "after" } | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const expanded = useExpandedFolders();
  const revealed = useRef("");
  const onFiles = pathname === "/files" || pathname.startsWith("/files/");
  const selected = folders.find((folder) => folder.id === selectedId) ?? null;

  useEffect(() => {
    return getTransport().subscribe("files", () => {
      setFolders(readFolders());
    });
  }, []);

  useEffect(() => {
    if (!selectedId || revealed.current === selectedId) {
      return;
    }
    const chain = folderChain(folders, selectedId);
    if (chain.length === 0) {
      return;
    }
    revealed.current = selectedId;
    expandFolders(chain.slice(0, -1).map((folder) => folder.id));
  }, [folders, selectedId]);

  function openFolder(id: string) {
    selectFolder(id);
    if (!onFiles) {
      router.push("/files");
    }
  }

  function clearDrag() {
    dragIdRef.current = null;
    setDragId(null);
    setDrop(null);
  }

  function moveFolderBefore(targetId: string, place: "before" | "after") {
    const sourceId = dragIdRef.current;
    clearDrag();
    if (!sourceId || sourceId === targetId) {
      return;
    }
    const source = folders.find((folder) => folder.id === sourceId);
    const target = folders.find((folder) => folder.id === targetId);
    if (!source || !target) {
      return;
    }
    const parent = folderParentId(folders, source);
    if (folderParentId(folders, target) !== parent) {
      return;
    }
    const ids = childFolders(folders, parent).map((folder) => folder.id);
    const next = ids.filter((id) => id !== sourceId);
    let index = next.indexOf(targetId);
    if (index < 0) {
      return;
    }
    if (place === "after") {
      index += 1;
    }
    next.splice(index, 0, sourceId);
    if (next.every((id, position) => id === ids[position])) {
      return;
    }
    reorderFolders(parent, next);
  }

  return (
    <>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.heading}>
          Folders
        </Text>
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
        <FolderTree
          folders={folders}
          parentId={null}
          depth={0}
          expanded={expanded}
          selectedId={onFiles ? selectedId : null}
          dragId={dragId}
          drop={drop}
          dragIdRef={dragIdRef}
          onOpen={openFolder}
          onDragStart={(id) => {
            dragIdRef.current = id;
            setDragId(id);
          }}
          onDragEnd={clearDrag}
          onPlace={(id, place) => setDrop((current) => (current?.id === id && current.place === place ? current : { id, place }))}
          onLeave={(id) => setDrop((current) => (current?.id === id ? null : current))}
          onDrop={moveFolderBefore}
        />
      </ScrollView>
      {creating ? (
        <NewFolderDialog
          note={
            selected
              ? `This folder is added inside ${selected.name}.`
              : "This folder is added at the top level, next to your other folders."
          }
          onClose={() => setCreating(false)}
          onSave={(name) => {
            const id = createFolder(name, selected?.id ?? null);
            setCreating(false);
            if (selected) {
              expandFolders([selected.id]);
            }
            if (id) {
              openFolder(id);
            }
          }}
        />
      ) : null}
    </>
  );
}

function FolderTree({
  folders,
  parentId,
  depth,
  expanded,
  selectedId,
  dragId,
  drop,
  dragIdRef,
  onOpen,
  onDragStart,
  onDragEnd,
  onPlace,
  onLeave,
  onDrop,
}: {
  folders: WorkspaceFolder[];
  parentId: string | null;
  depth: number;
  expanded: Set<string>;
  selectedId: string | null;
  dragId: string | null;
  drop: { id: string; place: "before" | "after" } | null;
  dragIdRef: { current: string | null };
  onOpen: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onPlace: (id: string, place: "before" | "after") => void;
  onLeave: (id: string) => void;
  onDrop: (id: string, place: "before" | "after") => void;
}) {
  const items = childFolders(folders, parentId);
  if (items.length === 0) {
    return null;
  }
  return (
    <View style={depth > 0 ? styles.nest : undefined}>
      {items.map((folder) => {
        const nested = childFolders(folders, folder.id);
        const open = expanded.has(folder.id);
        const active = folder.id === selectedId;
        const marker = drop?.id === folder.id ? drop.place : null;
        return (
          <View key={folder.id}>
            <FolderDragRow
              folderId={folder.id}
              dragIdRef={dragIdRef}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onPlace={onPlace}
              onLeave={onLeave}
              onDrop={onDrop}
            >
              <View style={[styles.row, active && styles.rowActive, dragId === folder.id && styles.rowDragging]}>
                {marker ? <View style={marker === "before" ? styles.dropBefore : styles.dropAfter} /> : null}
                {nested.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={open ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
                    accessibilityState={{ expanded: open }}
                    onPress={() => toggleFolderExpanded(folder.id)}
                    style={({ pressed }) => [styles.chevronHit, webPointer, pressed && styles.pressed]}
                  >
                    <View style={[styles.chevron, open && styles.chevronOpen]} />
                  </Pressable>
                ) : (
                  <View style={styles.chevronHit} />
                )}
                <Pressable
                  nativeID={`folder-handle-${folder.id}`}
                  testID={`folder-handle-${folder.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${folder.name}, ${fileCount(folder.files.length)}`}
                  accessibilityHint="Drag to move this folder"
                  accessibilityState={{ selected: active }}
                  onPress={() => onOpen(folder.id)}
                  style={({ pressed, hovered }) => [
                    styles.rowMain,
                    hovered && !active ? styles.rowHover : null,
                    webPointer,
                    webMotion,
                    pressed && styles.pressed,
                  ]}
                >
                  <GeometricIcon name="folder" size={22} color={active ? colors.sidebarText : colors.sidebarMuted} />
                  <Text style={[styles.name, active && styles.nameActive]} numberOfLines={1}>
                    {folder.name}
                  </Text>
                </Pressable>
              </View>
            </FolderDragRow>
            {open && nested.length > 0 ? (
              <FolderTree
                folders={folders}
                parentId={folder.id}
                depth={depth + 1}
                expanded={expanded}
                selectedId={selectedId}
                dragId={dragId}
                drop={drop}
                dragIdRef={dragIdRef}
                onOpen={onOpen}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onPlace={onPlace}
                onLeave={onLeave}
                onDrop={onDrop}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function FolderDragRow({
  folderId,
  dragIdRef,
  onDragStart,
  onDragEnd,
  onPlace,
  onLeave,
  onDrop,
  children,
}: {
  folderId: string;
  dragIdRef: { current: string | null };
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onPlace: (id: string, place: "before" | "after") => void;
  onLeave: (id: string) => void;
  onDrop: (id: string, place: "before" | "after") => void;
  children: ReactNode;
}) {
  const rowRef = useRef<View>(null);
  const startRef = useRef(onDragStart);
  const endRef = useRef(onDragEnd);
  const placeRef = useRef(onPlace);
  const leaveRef = useRef(onLeave);
  const dropRef = useRef(onDrop);
  startRef.current = onDragStart;
  endRef.current = onDragEnd;
  placeRef.current = onPlace;
  leaveRef.current = onLeave;
  dropRef.current = onDrop;

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }
    const row = rowRef.current as unknown as HTMLElement | null;
    const handle = (row?.querySelector(`[data-testid="folder-handle-${folderId}"]`) ||
      row?.querySelector(`#folder-handle-${CSS.escape(folderId)}`)) as HTMLElement | null;
    if (!row || !handle) {
      return;
    }
    handle.draggable = true;
    const placeFor = (event: DragEvent) => {
      const rect = row.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    };
    const onStart = (event: DragEvent) => {
      event.dataTransfer?.setData("application/x-netcore-folder", folderId);
      event.dataTransfer?.setData("text/plain", folderId);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
      }
      startRef.current(folderId);
    };
    const onEnd = () => endRef.current();
    const onOver = (event: DragEvent) => {
      if (!dragIdRef.current) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      placeRef.current(folderId, placeFor(event));
    };
    const onRowLeave = (event: DragEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && row.contains(next)) {
        return;
      }
      leaveRef.current(folderId);
    };
    const onRowDrop = (event: DragEvent) => {
      const sourceId = dragIdRef.current || event.dataTransfer?.getData("application/x-netcore-folder") || "";
      if (!sourceId) {
        return;
      }
      event.preventDefault();
      dragIdRef.current = sourceId;
      dropRef.current(folderId, placeFor(event));
    };
    handle.addEventListener("dragstart", onStart);
    handle.addEventListener("dragend", onEnd);
    row.addEventListener("dragover", onOver);
    row.addEventListener("dragleave", onRowLeave);
    row.addEventListener("drop", onRowDrop);
    return () => {
      handle.draggable = false;
      handle.removeEventListener("dragstart", onStart);
      handle.removeEventListener("dragend", onEnd);
      row.removeEventListener("dragover", onOver);
      row.removeEventListener("dragleave", onRowLeave);
      row.removeEventListener("drop", onRowDrop);
    };
  }, [dragIdRef, folderId]);

  return <View ref={rowRef}>{children}</View>;
}

function NewFolderDialog({
  note,
  onClose,
  onSave,
}: {
  note: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
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
          <Text style={styles.note}>{note}</Text>
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
    paddingBottom: 8,
  },
  heading: {
    ...font.brand,
    color: colors.sidebarText,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
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
    paddingLeft: 6,
    paddingRight: 8,
    paddingBottom: 16,
  },
  nest: {
    marginLeft: 22,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(244, 239, 231, 0.16)",
  },
  row: {
    position: "relative",
    minHeight: 48,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  rowDragging: {
    opacity: 0.45,
  },
  dropBefore: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.burgundy,
    zIndex: 2,
  },
  dropAfter: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.burgundy,
    zIndex: 2,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingRight: 10,
    borderRadius: 8,
  },
  rowHover: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  rowActive: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  chevronHit: {
    width: 28,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  chevron: {
    width: 8,
    height: 8,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.sidebarMuted,
    transform: [{ rotate: "-45deg" }],
    marginTop: -2,
  },
  chevronOpen: {
    transform: [{ rotate: "45deg" }],
    marginTop: -4,
  },
  name: {
    flex: 1,
    minWidth: 0,
    color: colors.sidebarText,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  nameActive: {
    color: colors.sidebarText,
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
