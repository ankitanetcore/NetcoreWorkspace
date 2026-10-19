import { useRouter } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { BackButton } from "@/components/BackButton";
import { GeometricIcon } from "@/components/GeometricIcon";
import type { FilesSnapshot, WorkspaceFile, WorkspaceFolder } from "@/domain/types";
import { FileDownload } from "@/features/files/FileDownload";
import { FilePreview, storedText } from "@/features/files/FilePreview";
import {
  createFolder,
  deleteFile,
  deleteFolder,
  moveFile,
  renameFile,
  renameFolder,
  updateEditableFile,
  uploadAssetIntoFolder,
  uploadIntoFolder,
} from "@/features/files/fileActions";
import { assetFromFile } from "@/features/files/desktopFile";
import { FileDropSurface } from "@/features/files/FileDropSurface";
import { filePreviewKind, fileTypeLabel, formatBytes, previewByteLimit } from "@/features/files/fileKind";
import { fileDownloadUrl } from "@/features/files/downloads";
import { selectFolder, useSelectedFolder } from "@/features/files/folderSelection";
import { clearRequestedFile, useRequestedFile } from "@/features/files/openFile";
import { shareFileToPeer, shareFileToRoom } from "@/features/files/shareFile";
import { selectDirect, selectRoom } from "@/features/messages/selection";
import { useKnownPeers } from "@/features/rooms/RoomDialogs";
import { useSession } from "@/session/Session";
import { subscribeTransferNotice } from "@/features/files/transferNotice";
import { webPointer } from "@/theme/pressable";
import { colors, layout, text } from "@/theme/tokens";
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

function fileCount(count: number) {
  return count === 1 ? "1 file" : `${count} files`;
}

export function FilesScreen() {
  const [snapshot, setSnapshot] = useState(readFiles);
  const { width } = useWindowDimensions();
  const split = width >= layout.desktopMinWidth;
  const folderId = useSelectedFolder();
  const [fileId, setFileId] = useState<string | null>(null);
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
      selectFolder(snapshot.folders[0]?.id ?? null);
      setFileId(null);
      return;
    }
    if (!fileId) {
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
  }, [folderId, fileId, snapshot.folders]);

  useEffect(() => {
    if (split && folderId === null && snapshot.folders[0]) {
      selectFolder(snapshot.folders[0].id);
    }
  }, [split, folderId, snapshot.folders]);

  const requested = useRequestedFile();
  const folder = snapshot.folders.find((item) => item.id === folderId) ?? null;
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
    clearRequestedFile();
  }, [requested, snapshot.folders]);

  function openFolder(id: string) {
    selectFolder(id);
    setFileId(null);
  }

  if (!split && file && folder) {
    return (
      <View style={styles.screen}>
        <Preview file={file} folder={folder} onBack={() => setFileId(null)} />
      </View>
    );
  }

  if (!split && folder) {
    return (
      <View style={styles.screen}>
        <FolderDrop folder={folder} onAdded={setFileId}>
          <FolderHeader folder={folder} onBack={() => selectFolder(null)} onAdded={setFileId} />
          <FileList folder={folder} folders={snapshot.folders} selectedId={fileId} onOpen={setFileId} />
        </FolderDrop>
      </View>
    );
  }

  if (!split) {
    return (
      <View style={styles.screen}>
        <FoldersHeader onCreated={openFolder} />
        <FolderList folders={snapshot.folders} selectedId={folderId} onOpen={openFolder} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, styles.split]}>
      <View style={[styles.column, styles.browser, styles.browserPad]}>
        <View style={styles.fileFrame}>
          {folder ? (
            <FolderDrop folder={folder} onAdded={setFileId}>
              <FolderHeader edge folder={folder} onAdded={setFileId} />
              <FileList columns folder={folder} folders={snapshot.folders} selectedId={fileId} onOpen={setFileId} />
            </FolderDrop>
          ) : null}
        </View>
      </View>
      {file && folder ? (
        <View style={styles.preview}>
          <Preview file={file} folder={folder} onBack={() => setFileId(null)} />
        </View>
      ) : null}
    </View>
  );
}

function FolderDrop({
  folder,
  onAdded,
  children,
}: {
  folder: WorkspaceFolder;
  onAdded: (fileId: string) => void;
  children: ReactNode;
}) {
  const [pending, setPending] = useState<File[] | null>(null);
  const [adding, setAdding] = useState(false);
  const names = pending?.map((file) => file.name) ?? [];
  const title = names.length === 1 ? "Add this file?" : `Add ${names.length} files?`;
  const listed = names.slice(0, 3).join(", ");
  const extra = names.length > 3 ? `, and ${names.length - 3} more` : "";
  const body = names.length === 1 ? `Add ${names[0]} to ${folder.name}.` : `Add ${listed}${extra} to ${folder.name}.`;

  async function add() {
    if (!pending || adding) {
      return;
    }
    setAdding(true);
    let lastId: string | null = null;
    for (const file of pending) {
      const saved = await uploadAssetIntoFolder(folder.id, assetFromFile(file));
      if (saved) {
        lastId = saved.id;
      }
    }
    setAdding(false);
    setPending(null);
    if (lastId) {
      onAdded(lastId);
    }
  }

  return (
    <FileDropSurface label={`Drop to add to ${folder.name}`} onFiles={setPending}>
      {children}
      {pending ? (
        <AddFilesDialog
          title={title}
          body={body}
          busy={adding}
          onClose={() => {
            if (!adding) {
              setPending(null);
            }
          }}
          onAdd={() => void add()}
        />
      ) : null}
    </FileDropSurface>
  );
}

function AddFilesDialog({
  title,
  body,
  busy,
  onClose,
  onAdd,
}: {
  title: string;
  body: string;
  busy: boolean;
  onClose: () => void;
  onAdd: () => void;
}) {
  return (
    <Overlay onClose={onClose}>
      <View style={styles.dialog}>
        <Text accessibilityRole="header" style={text.title}>
          {title}
        </Text>
        <Text style={text.body}>{body}</Text>
        <View style={styles.dialogActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            disabled={busy}
            onPress={onClose}
            style={({ pressed }) => [styles.textButton, webPointer, pressed && styles.pressed]}
          >
            <Text style={styles.textButtonLabel}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={busy ? "Adding" : "Add"}
            disabled={busy}
            onPress={onAdd}
            style={({ pressed }) => [styles.upload, busy && styles.disabled, webPointer, pressed && !busy ? styles.pressed : null]}
          >
            <Text style={styles.uploadLabel}>{busy ? "Adding…" : "Add"}</Text>
          </Pressable>
        </View>
      </View>
    </Overlay>
  );
}

function FoldersHeader({ onCreated }: { onCreated: (id: string) => void }) {
  const [creating, setCreating] = useState(false);

  return (
    <>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={text.paneTitle}>
          Folders
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New Folder"
          onPress={() => setCreating(true)}
          style={({ pressed }) => [webPointer, pressed && styles.pressed]}
        >
          <Text style={styles.headerAction}>+ New Folder</Text>
        </Pressable>
      </View>
      {creating ? (
        <NameDialog
          title="New Folder"
          note="This folder is added at the top level, next to your other folders."
          label="Folder name"
          action="Create"
          onClose={() => setCreating(false)}
          onSave={(name) => {
            const id = createFolder(name);
            setCreating(false);
            if (id) {
              onCreated(id);
            }
          }}
        />
      ) : null}
    </>
  );
}

function FolderHeader({
  folder,
  onAdded,
  onBack,
  edge = false,
}: {
  folder: WorkspaceFolder;
  onAdded: (fileId: string) => void;
  onBack?: () => void;
  edge?: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [transferNote, setTransferNote] = useState("");

  useEffect(() => subscribeTransferNotice(setTransferNote), []);

  return (
    <>
      <View style={[styles.header, edge && styles.pageHeader]}>
        {onBack ? <BackButton onPress={onBack} /> : null}
        <View style={[styles.headerCopy, edge && styles.pageTitle]}>
          {edge ? <GeometricIcon name="folder" size={18} color={colors.burgundy} /> : null}
          <Text accessibilityRole="header" style={[text.paneTitle, styles.folderName]} numberOfLines={1}>
            {folder.name}
          </Text>
          <Text style={text.meta}>{fileCount(folder.files.length)}</Text>
        </View>
        <View style={styles.headerTools}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Upload to ${folder.name}`}
            onPress={() => {
              void uploadIntoFolder(folder.id).then((file) => {
                if (file) {
                  onAdded(file.id);
                }
              });
            }}
            style={({ pressed, hovered }) => [
              styles.uploadOutline,
              hovered && styles.uploadOutlineHover,
              webPointer,
              pressed && styles.pressed,
            ]}
          >
            <UploadMark />
            <Text style={styles.uploadOutlineLabel}>Upload</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Folder options"
            onPress={() => setMenu(true)}
            style={({ pressed }) => [styles.more, webPointer, pressed && styles.pressed]}
          >
            <Text style={styles.moreLabel}>•••</Text>
          </Pressable>
        </View>
      </View>
      {transferNote ? <Text style={styles.notice}>{transferNote}</Text> : null}
      {menu ? (
        <Menu
          onClose={() => setMenu(false)}
          items={[
            {
              label: "Rename Folder",
              onPress: () => {
                setMenu(false);
                setRenaming(true);
              },
            },
            {
              label: "Delete Folder",
              danger: true,
              onPress: () => {
                setMenu(false);
                setConfirming(true);
              },
            },
          ]}
        />
      ) : null}
      {renaming ? (
        <NameDialog
          title="Rename Folder"
          label="Folder name"
          action="Save"
          initial={folder.name}
          onClose={() => setRenaming(false)}
          onSave={(name) => {
            renameFolder(folder.id, name);
            setRenaming(false);
          }}
        />
      ) : null}
      {confirming ? (
        <ConfirmDialog
          title={`Delete "${folder.name}"?`}
          body="This will remove the folder and the files inside it."
          confirm="Delete Folder"
          onClose={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            deleteFolder(folder.id);
          }}
        />
      ) : null}
    </>
  );
}

function UploadMark() {
  return (
    <View style={styles.uploadMark}>
      <View style={styles.uploadArrow} />
      <View style={styles.uploadStem} />
      <View style={styles.uploadBase} />
    </View>
  );
}

function FolderList({
  folders,
  selectedId,
  onOpen,
}: {
  folders: WorkspaceFolder[];
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.list}>
      {folders.map((folder) => {
        const active = folder.id === selectedId;
        const count = folder.files.length;
        return (
          <Pressable
            key={folder.id}
            accessibilityRole="button"
            accessibilityLabel={`${folder.name}, ${fileCount(count)}`}
            accessibilityState={{ selected: active }}
            onPress={() => onOpen(folder.id)}
            style={({ pressed }) => [styles.row, active && styles.rowActive, webPointer, pressed && styles.pressed]}
          >
            {active ? <View style={styles.rowBar} /> : null}
            <GeometricIcon name="folder" size={16} color={active ? colors.burgundy : colors.navy} />
            <Text style={styles.rowName} numberOfLines={1}>
              {folder.name}
            </Text>
            <Text style={styles.count}>{fileCount(count)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
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

function FileList({
  folder,
  folders,
  selectedId,
  onOpen,
  columns = false,
}: {
  folder: WorkspaceFolder;
  folders: WorkspaceFolder[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  columns?: boolean;
}) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuFile = folder.files.find((file) => file.id === menuId) ?? null;
  const peers = useKnownPeers();
  const { clientId } = useSession();

  return (
    <>
      <ScrollView contentContainerStyle={styles.list}>
        {columns ? (
          <View style={styles.columns}>
            <View style={styles.nameCol}>
              <Text style={[styles.columnLabel, styles.nameLabel]}>Name</Text>
            </View>
            <Text style={[styles.columnLabel, styles.typeCol]}>Type</Text>
            <Text style={[styles.columnLabel, styles.modifiedCol]}>Modified</Text>
            <Text style={[styles.columnLabel, styles.actionsCol]}>Actions</Text>
          </View>
        ) : null}
        {folder.files.length === 0 ? <Text style={styles.emptyList}>No files yet</Text> : null}
        {folder.files.map((file) => {
          const active = file.id === selectedId;
          const type = fileTypeLabel(file.name, file.mimeType);
          const owner = ownerNote(file, peers, clientId);
          if (columns) {
            return (
              <Pressable
                key={file.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onOpen(file.id)}
                style={({ pressed, hovered }) => [
                  styles.fileRow,
                  active && styles.fileRowActive,
                  hovered && !active && styles.fileRowHover,
                  webPointer,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.nameCol}>
                  <GeometricIcon name="file" size={16} color={active ? colors.burgundy : colors.navy} />
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {file.name}
                    </Text>
                    {owner ? (
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {owner}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <Text style={[styles.columnValue, styles.typeCol]} numberOfLines={1}>
                  {type}
                </Text>
                <Text style={[styles.columnValue, styles.modifiedCol]} numberOfLines={1}>
                  {file.detail}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`File options for ${file.name}`}
                  onPress={() => setMenuId(file.id)}
                  style={({ pressed }) => [styles.actionsCol, webPointer, pressed && styles.pressed]}
                >
                  <Text style={styles.moreLabel}>•••</Text>
                </Pressable>
              </Pressable>
            );
          }
          return (
            <View key={file.id} style={[styles.row, active && styles.rowActive]}>
              {active ? <View style={styles.rowBar} /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onOpen(file.id)}
                style={({ pressed }) => [styles.fileMain, webPointer, pressed && styles.pressed]}
              >
                <GeometricIcon name="file" size={16} color={active ? colors.burgundy : colors.navy} />
                <View style={styles.rowCopy}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {file.name}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {owner ? `${type} · ${file.detail} · ${owner}` : `${type} · ${file.detail}`}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`File options for ${file.name}`}
                onPress={() => setMenuId(file.id)}
                style={({ pressed }) => [styles.more, webPointer, pressed && styles.pressed]}
              >
                <Text style={styles.moreLabel}>•••</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
      {menuFile ? (
        <FileMenu
          file={menuFile}
          folderId={folder.id}
          folders={folders}
          includeDownload
          onClose={() => setMenuId(null)}
        />
      ) : null}
    </>
  );
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
          <GeometricIcon name="file" size={18} color={colors.burgundy} />
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

function FileMenu({
  file,
  folderId,
  folders,
  includeDownload,
  onClose,
}: {
  file: WorkspaceFile;
  folderId: string;
  folders: WorkspaceFolder[];
  includeDownload: boolean;
  onClose: () => void;
}) {
  const [moving, setMoving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [sharing, setSharing] = useState(false);
  const others = folders.filter((folder) => folder.id !== folderId);
  const downloadUrl = fileDownloadUrl(file.id);
  const router = useRouter();
  const { name } = useSession();
  const peers = useKnownPeers();
  const rooms = getTransport().snapshot("rooms").rooms;

  if (renaming) {
    return (
      <NameDialog
        title="Rename File"
        label="File name"
        action="Save"
        initial={file.name}
        onClose={onClose}
        onSave={(next) => {
          renameFile(file.id, next);
          onClose();
        }}
      />
    );
  }

  if (sharing) {
    return (
      <Overlay onClose={onClose}>
        <View style={styles.menu}>
          <Text style={styles.shareHeading}>Share with a room</Text>
          {rooms.map((room) => (
            <Pressable
              key={room.id}
              accessibilityRole="button"
              accessibilityLabel={`Share with ${room.name}`}
              onPress={() => {
                shareFileToRoom(room.id, file, folderId, name);
                selectRoom(room.id);
                onClose();
                router.push("/rooms");
              }}
              style={({ pressed }) => [styles.menuItem, webPointer, pressed && styles.pressed]}
            >
              <Text style={styles.menuLabel}>{room.name}</Text>
            </Pressable>
          ))}
          <Text style={styles.shareHeading}>Share with a person</Text>
          {peers
            .filter((peer) => peer.clientId !== currentClientId())
            .map((peer) => (
              <Pressable
                key={peer.clientId}
                accessibilityRole="button"
                accessibilityLabel={`Share with ${peer.displayName}`}
                onPress={() => {
                  shareFileToPeer(peer.clientId, file, folderId, name);
                  selectDirect(peer.clientId);
                  onClose();
                  router.push("/rooms");
                }}
                style={({ pressed }) => [styles.menuItem, webPointer, pressed && styles.pressed]}
              >
                <Text style={styles.menuLabel}>{peer.displayName}</Text>
              </Pressable>
            ))}
        </View>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <View style={styles.menu}>
        {includeDownload && downloadUrl ? <FileDownload url={downloadUrl} name={file.name} tone="menu" /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Rename ${file.name}`}
          onPress={() => setRenaming(true)}
          style={({ pressed }) => [styles.menuItem, webPointer, pressed && styles.pressed]}
        >
          <Text style={styles.menuLabel}>Rename</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Share ${file.name}`}
          onPress={() => setSharing(true)}
          style={({ pressed }) => [styles.menuItem, webPointer, pressed && styles.pressed]}
        >
          <Text style={styles.menuLabel}>Share</Text>
        </Pressable>
        {others.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Move ${file.name}`}
            onPress={() => setMoving((value) => !value)}
            style={({ pressed }) => [styles.menuItem, webPointer, pressed && styles.pressed]}
          >
            <Text style={styles.menuLabel}>Move</Text>
          </Pressable>
        ) : null}
        {moving
          ? others.map((folder) => (
              <Pressable
                key={folder.id}
                accessibilityRole="button"
                accessibilityLabel={`Move to ${folder.name}`}
                onPress={() => {
                  moveFile(file.id, folder.id);
                  onClose();
                }}
                style={({ pressed }) => [styles.menuItem, webPointer, pressed && styles.pressed]}
              >
                <Text style={styles.menuLabel}>{folder.name}</Text>
              </Pressable>
            ))
          : null}
        <View style={styles.menuDivider} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${file.name}`}
          onPress={() => {
            deleteFile(file.id);
            onClose();
          }}
          style={({ pressed }) => [styles.menuItem, webPointer, pressed && styles.pressed]}
        >
          <Text style={styles.menuDanger}>Delete</Text>
        </Pressable>
      </View>
    </Overlay>
  );
}

function NameDialog({
  title,
  note,
  label,
  action,
  initial = "",
  onClose,
  onSave,
}: {
  title: string;
  note?: string;
  label: string;
  action: string;
  initial?: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const name = draft.trim();

  return (
    <Overlay onClose={onClose}>
      <View style={styles.dialog}>
        <Text accessibilityRole="header" style={text.title}>
          {title}
        </Text>
        {note ? <Text style={styles.dialogNote}>{note}</Text> : null}
        <Text style={styles.fieldLabel}>{label}</Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => {
            if (name) {
              onSave(name);
            }
          }}
          autoFocus
          placeholder={label}
          placeholderTextColor={colors.faint}
          accessibilityLabel={label}
          style={styles.nameInput}
        />
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
            accessibilityLabel={action}
            disabled={!name}
            onPress={() => onSave(name)}
            style={({ pressed }) => [styles.upload, !name && styles.disabled, webPointer, pressed && name ? styles.pressed : null]}
          >
            <Text style={styles.uploadLabel}>{action}</Text>
          </Pressable>
        </View>
      </View>
    </Overlay>
  );
}

function ConfirmDialog({
  title,
  body,
  confirm,
  onClose,
  onConfirm,
}: {
  title: string;
  body: string;
  confirm: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Overlay onClose={onClose}>
      <View style={styles.dialog}>
        <Text accessibilityRole="header" style={text.title}>
          {title}
        </Text>
        <Text style={text.body}>{body}</Text>
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
            accessibilityLabel={confirm}
            onPress={onConfirm}
            style={({ pressed }) => [styles.dangerButton, webPointer, pressed && styles.pressed]}
          >
            <Text style={styles.uploadLabel}>{confirm}</Text>
          </Pressable>
        </View>
      </View>
    </Overlay>
  );
}

function Menu({
  items,
  onClose,
}: {
  items: Array<{ label: string; danger?: boolean; onPress: () => void }>;
  onClose: () => void;
}) {
  return (
    <Overlay onClose={onClose}>
      <View style={styles.menu}>
        {items.map((item, index) => (
          <View key={item.label}>
            {item.danger && index > 0 ? <View style={styles.menuDivider} /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={item.onPress}
              style={({ pressed }) => [styles.menuItem, webPointer, pressed && styles.pressed]}
            >
              <Text style={item.danger ? styles.menuDanger : styles.menuLabel}>{item.label}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </Overlay>
  );
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.background,
  },
  split: {
    flexDirection: "row",
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
  preview: {
    width: 380,
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 0,
    minHeight: 0,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
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
