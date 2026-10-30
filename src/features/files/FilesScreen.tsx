import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { BackButton } from "@/components/BackButton";
import type { FilesSnapshot, WorkspaceFile, WorkspaceFolder } from "@/domain/types";
import { FileDownload } from "@/features/files/FileDownload";
import { FilePreview, storedText } from "@/features/files/FilePreview";
import { FilesLibrary } from "@/features/files/FilesLibrary";
import { updateEditableFile } from "@/features/files/fileActions";
import { filePreviewKind, fileTypeLabel, formatBytes, previewByteLimit } from "@/features/files/fileKind";
import { fileDownloadUrl } from "@/features/files/downloads";
import { selectFolder, useSelectedFolder } from "@/features/files/folderSelection";
import { clearRequestedFile, useRequestedFile } from "@/features/files/openFile";
import { useKnownPeers } from "@/features/rooms/RoomDialogs";
import { useSession } from "@/session/Session";
import { colors, text } from "@/theme/tokens";
import { currentClientId } from "@/session/currentIdentity";
import { connectionPhase, subscribeConnection, type ConnectionPhase } from "@/transport/connectionPhase";
import { getTransport } from "@/transport";

function readFiles(): FilesSnapshot {
  const next = getTransport().snapshot("files");
  return {
    folders: next.folders.map((folder) => ({
      ...folder,
      files: folder.files.map((file) => ({ ...file })),
    })),
  };
}

export function FilesScreen() {
  const [snapshot, setSnapshot] = useState(readFiles);
  const folderId = useSelectedFolder();
  const [fileId, setFileId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previousFolder = useRef(folderId);

  useEffect(() => {
    return getTransport().subscribe("files", () => {
      setSnapshot(readFiles());
    });
  }, []);

  useEffect(() => {
    const folderChanged = previousFolder.current !== folderId;
    previousFolder.current = folderId;
    if (folderId && !snapshot.folders.some((folder) => folder.id === folderId)) {
      selectFolder(null);
      setFileId(null);
      setPreviewOpen(false);
      return;
    }
    if (!fileId) {
      return;
    }
    if (!folderId) {
      const exists = snapshot.folders.some((folder) => folder.files.some((file) => file.id === fileId));
      if (!exists) {
        setFileId(null);
        setPreviewOpen(false);
      }
      return;
    }
    const current = snapshot.folders.find((folder) => folder.id === folderId);
    if (current?.files.some((file) => file.id === fileId)) {
      return;
    }
    const moved = snapshot.folders.find((folder) => folder.files.some((file) => file.id === fileId));
    if (moved && !folderChanged) {
      selectFolder(moved.id);
      return;
    }
    setFileId(null);
    setPreviewOpen(false);
  }, [folderId, fileId, snapshot.folders]);

  const requested = useRequestedFile();
  const folder =
    snapshot.folders.find((item) => item.files.some((entry) => entry.id === fileId)) ??
    snapshot.folders.find((item) => item.id === folderId) ??
    null;
  const file = folder?.files.find((item) => item.id === fileId) ?? null;

  useEffect(() => {
    if (!requested) {
      return;
    }
    const target = snapshot.folders.find((item) => item.id === requested.folderId);
    if (!target?.files.some((item) => item.id === requested.fileId)) {
      return;
    }
    selectFolder(requested.folderId);
    setFileId(requested.fileId);
    setPreviewOpen(true);
    clearRequestedFile();
  }, [requested, snapshot.folders]);

  return (
    <View style={styles.screen}>
      <FilesLibrary
        folders={snapshot.folders}
        folderId={folderId}
        selectedFileId={fileId}
        onOpenFolder={(id) => {
          selectFolder(id);
          setFileId(null);
          setPreviewOpen(false);
        }}
        onOpenFile={(_nextFolderId, nextFileId) => {
          if (fileId === nextFileId) {
            setPreviewOpen(true);
            return;
          }
          setFileId(nextFileId);
          setPreviewOpen(false);
        }}
      />
      {previewOpen && file && folder ? (
        <Modal transparent visible animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
          <View style={styles.fileScrim}>
            <Pressable accessibilityLabel="Close file" style={styles.fileDismiss} onPress={() => setPreviewOpen(false)} />
            <View style={styles.fileDialog}>
              <Preview file={file} folder={folder} />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function ownerNote(file: WorkspaceFile, peers: ReturnType<typeof useKnownPeers>, clientId: string) {
  if (!file.clientId) {
    return null;
  }
  if (file.clientId === clientId) {
    return "You";
  }
  return peers.find((peer) => peer.clientId === file.clientId)?.displayName || "Member";
}

function Preview({
  file,
  folder,
  onBack,
}: {
  file: WorkspaceFile;
  folder: WorkspaceFolder;
  onBack?: () => void;
}) {
  const downloadUrl = fileDownloadUrl(file.id);
  const peers = useKnownPeers();
  const { clientId } = useSession();
  const owner = ownerNote(file, peers, clientId);
  const [phase, setPhase] = useState<ConnectionPhase>(connectionPhase);
  const kind = filePreviewKind(file.name, file.mimeType);
  const tooLarge = kind !== "unsupported" && typeof file.size === "number" && file.size > previewByteLimit[kind];
  const typeLabel = fileTypeLabel(file.name, file.mimeType);
  const sizeLabel = typeof file.size === "number" ? formatBytes(file.size) : "";

  useEffect(() => subscribeConnection(setPhase), []);

  return (
    <View style={styles.fileBody}>
      <View style={styles.header}>
        {onBack ? <BackButton onPress={onBack} /> : null}
        <View style={styles.previewTitle}>
          <View style={styles.rowCopy}>
            <Text accessibilityRole="header" style={text.paneTitle} numberOfLines={1}>
              {file.name}
            </Text>
            <Text style={text.meta} numberOfLines={1}>
              {sizeLabel ? `${typeLabel} · ${sizeLabel}` : typeLabel}
            </Text>
            {owner ? (
              <Text style={text.faint} numberOfLines={1}>
                {owner}
              </Text>
            ) : null}
          </View>
        </View>
        {downloadUrl ? <FileDownload url={downloadUrl} name={file.name} /> : null}
      </View>
      {file.editable && kind === "text" && !tooLarge ? (
        <FileEditor key={file.id} folderId={folder.id} file={file} />
      ) : (
        <FilePreview
          key={file.id}
          file={file}
          url={downloadUrl}
          unavailable={unavailableReason(file, peers, clientId, phase, downloadUrl)}
        />
      )}
    </View>
  );
}

function unavailableReason(
  file: WorkspaceFile,
  peers: ReturnType<typeof useKnownPeers>,
  clientId: string,
  phase: ConnectionPhase,
  url: string | null,
) {
  if (url || storedText(file)) {
    return null;
  }
  if (file.clientId && file.clientId !== clientId) {
    const peer = peers.find((item) => item.clientId === file.clientId);
    if (peer?.status === "offline") {
      const who = peer.displayName || "The other device";
      return `This file isn't available. ${who} is offline.`;
    }
  }
  if (phase === "disconnected" || phase === "reconnecting") {
    return "This file isn't available right now.";
  }
  return null;
}

function FileEditor({ folderId, file }: { folderId: string; file: WorkspaceFile }) {
  const [value, setValue] = useState(file.body);

  return (
    <TextInput
      value={value}
      onChangeText={(next) => {
        setValue(next);
        updateEditableFile(folderId, file.id, next);
      }}
      multiline
      placeholder="Start writing"
      placeholderTextColor={colors.faint}
      accessibilityLabel={`Edit ${file.name}`}
      style={styles.editor}
    />
  );
}


const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.background,
  },
  fileScrim: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    backgroundColor: "rgba(20, 32, 51, 0.46)",
  },
  fileDismiss: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  fileDialog: {
    zIndex: 1,
    width: "100%",
    maxWidth: 980,
    height: "86%",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  column: {
    minHeight: 0,
    minWidth: 0,
  },
  folderColumn: {
    width: 220,
    flexGrow: 0,
    flexShrink: 0,
    borderRightWidth: 1,
    borderRightColor: colors.line,
  },
  browser: {
    flex: 1,
    borderRightWidth: 0,
  },
  browserPad: {
    paddingHorizontal: 24,
  },
  fileFrame: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    maxWidth: 1100,
  },
  columns: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  columnLabel: {
    color: colors.faint,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  columnValue: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  nameCol: {
    width: "55%",
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nameLabel: {
    marginLeft: 24,
  },
  typeCol: {
    flex: 1,
    minWidth: 64,
  },
  modifiedCol: {
    flex: 1.4,
    minWidth: 96,
  },
  actionsCol: {
    width: 72,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
  },
  fileRow: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  fileRowActive: {
    backgroundColor: colors.burgundySoft,
  },
  fileRowHover: {
    backgroundColor: colors.surface,
  },
  shareHeading: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  fileBody: {
    flex: 1,
    minHeight: 0,
  },
  header: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    zIndex: 2,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pageHeader: {
    height: 80,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  pageTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  folderName: {
    flexShrink: 1,
  },
  headerTools: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerAction: {
    color: colors.burgundy,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  notice: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  list: {
    paddingTop: 6,
    paddingBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
    marginHorizontal: 8,
    marginVertical: 1,
    paddingLeft: 12,
    paddingRight: 4,
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
    top: 12,
    bottom: 12,
    width: 2,
    borderRadius: 1,
    backgroundColor: colors.burgundy,
  },
  fileMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowName: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  rowMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  count: {
    color: colors.faint,
    fontSize: 12,
    lineHeight: 16,
    marginRight: 8,
    flexShrink: 0,
  },
  emptyList: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  upload: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadOutline: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  uploadOutlineHover: {
    backgroundColor: colors.background,
    borderColor: colors.faint,
  },
  uploadOutlineLabel: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  uploadMark: {
    width: 14,
    height: 14,
    alignItems: "center",
  },
  uploadArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 5,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: colors.navy,
  },
  uploadStem: {
    width: 1.5,
    height: 5,
    backgroundColor: colors.navy,
  },
  uploadBase: {
    width: 10,
    height: 1.5,
    marginTop: 1,
    backgroundColor: colors.navy,
  },
  dialogNote: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  uploadLabel: {
    color: colors.youText,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  more: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  moreLabel: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: 1,
    fontWeight: "700",
  },
  previewTitle: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  body: {
    paddingHorizontal: 24,
    paddingVertical: 22,
  },
  editor: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 18,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
    textAlignVertical: "top",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    marginTop: 4,
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
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
    maxWidth: 420,
    gap: 12,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    zIndex: 1,
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  dialogActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
  },
  textButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  textButtonLabel: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  dangerButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.burgundy,
    alignItems: "center",
    justifyContent: "center",
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
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
  },
  menuDanger: {
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
  nameInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.background,
    color: colors.ink,
    fontSize: 15,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.72,
  },
});
