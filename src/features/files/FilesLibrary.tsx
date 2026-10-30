import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { createElement, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";

import { GeometricIcon } from "@/components/GeometricIcon";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { SearchIcon } from "@/components/SearchIcon";
import { PencilIcon } from "@/components/ChatIcons";
import type { WorkspaceFile, WorkspaceFolder } from "@/domain/types";
import { systemClientId, systemDisplayName } from "@/session/systemIdentity";
import { assetFromFile } from "@/features/files/desktopFile";
import { fileDownloadUrl } from "@/features/files/downloads";
import { saveDownloads } from "@/features/files/saveDownloads";
import { FileDownload } from "@/features/files/FileDownload";
import { FileDropSurface } from "@/features/files/FileDropSurface";
import {
  createFolder,
  deleteFile,
  deleteFolder,
  moveFile,
  moveFolder,
  pinFile,
  renameFile,
  renameFolder,
  uploadAssetIntoFolder,
} from "@/features/files/fileActions";
import { filePreviewKind, formatBytes } from "@/features/files/fileKind";
import { childFolders, folderChain, folderParentId, nestedFolderIds } from "@/features/files/folderTree";
import { shareFileToPeer, shareFileToRoom } from "@/features/files/shareFile";
import { subscribeTransferNotice } from "@/features/files/transferNotice";
import { selectDirect, selectRoom } from "@/features/messages/selection";
import { useKnownPeers } from "@/features/rooms/RoomDialogs";
import { currentClientId } from "@/session/currentIdentity";
import { useSession } from "@/session/Session";
import { webPointer } from "@/theme/pressable";
import { colors, font, text } from "@/theme/tokens";
import { getTransport } from "@/transport";

type Category = "all" | "documents" | "images" | "videos" | "audio" | "other";
type ViewMode = "list" | "grid";
type SortKey = "name" | "uploaded";
type People = {
  peers: ReturnType<typeof useKnownPeers>;
  self: string;
  selfName: string;
  selfPhoto?: string;
};

type LibraryRow =
  | { kind: "folder"; folder: WorkspaceFolder; path: string }
  | { kind: "file"; file: WorkspaceFile; folderId: string; path: string };

type Dialog =
  | { type: "create" }
  | { type: "rename-folder"; folderId: string }
  | { type: "delete-folder"; folderId: string }
  | { type: "move-folder"; folderId: string }
  | { type: "folder-menu"; folderId: string; fromPath?: boolean }
  | { type: "file-menu"; folderId: string; fileId: string }
  | { type: "rename-file"; fileId: string; name: string }
  | { type: "move-files"; fileIds: string[] }
  | { type: "download-files"; fileIds: string[] }
  | { type: "delete-files"; fileIds: string[] }
  | { type: "share"; folderId: string; fileId: string; name: string }
  | null;

const categories: Array<{ id: Category; label: string }> = [
  { id: "all", label: "All files" },
  { id: "documents", label: "Documents" },
  { id: "images", label: "Images" },
  { id: "videos", label: "Videos" },
  { id: "audio", label: "Audio" },
  { id: "other", label: "Other" },
];

export function FilesLibrary({
  folders,
  folderId,
  selectedFileId,
  onOpenFolder,
  onOpenFile,
}: {
  folders: WorkspaceFolder[];
  folderId: string | null;
  selectedFileId: string | null;
  onOpenFolder: (id: string | null) => void;
  onOpenFile: (folderId: string, fileId: string) => void;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 860;
  const narrow = width < 640;
  const peers = useKnownPeers();
  const { name: selfName, photoUri: selfPhoto, clientId } = useSession();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [mode, setMode] = useState<ViewMode>("list");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pageSizeOpen, setPageSizeOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);

  useEffect(() => subscribeTransferNotice(setNotice), []);
  useEffect(() => {
    setPage(0);
    setSelected([]);
    setUploadOpen(false);
  }, [folderId, query, category, sortKey, pageSize]);

  const location = folders.find((folder) => folder.id === folderId) ?? null;
  const chain = folderChain(folders, location?.id ?? null);
  const people = useMemo<People>(
    () => ({ peers, self: clientId || currentClientId(), selfName, selfPhoto }),
    [peers, clientId, selfName, selfPhoto],
  );

  const listed = useMemo(() => {
    const source = location ? [location] : folders;
    const q = query.trim().toLowerCase();
    const foldersHere: LibraryRow[] = [];
    if (location && category === "all") {
      for (const folder of childFolders(folders, location.id)) {
        const path = folderLocation(folders, folder.id);
        if (q && !`${folder.name} ${path}`.toLowerCase().includes(q)) {
          continue;
        }
        foldersHere.push({ kind: "folder", folder, path });
      }
    }
    const files: Extract<LibraryRow, { kind: "file" }>[] = [];
    for (const folder of source) {
      for (const file of folder.files) {
        const owner = ownerName(file, people);
        const path = filePath(folders, folder.id);
        const haystack = `${file.name} ${path} ${owner}`.toLowerCase();
        if (q && !haystack.includes(q)) {
          continue;
        }
        if (category !== "all" && fileCategory(file) !== category) {
          continue;
        }
        files.push({ kind: "file", file, folderId: folder.id, path });
      }
    }
    const pinned = files.filter((row) => row.file.pinned);
    const loose = files.filter((row) => !row.file.pinned);
    loose.sort((left, right) => compareFiles(left.file, right.file, sortKey));
    return [...pinned, ...foldersHere, ...loose];
  }, [folders, location, query, category, sortKey, people]);

  const pageCount = Math.max(1, Math.ceil(listed.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = listed.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const visibleIds = visible.flatMap((row) => (row.kind === "file" ? [row.file.id] : []));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  async function runUpload(work: () => Promise<void>, label: string) {
    setBusyLabel(label);
    try {
      await work();
    } finally {
      setBusyLabel("");
    }
  }

  function destinationId() {
    const live = getTransport().snapshot("files").folders;
    if (folderId && live.some((folder) => folder.id === folderId)) {
      return folderId;
    }
    const uploads = live.find((folder) => !folder.parentId && folder.name === "Uploads");
    return uploads?.id ?? createFolder("Uploads");
  }

  async function placeFiles(incoming: File[]) {
    if (incoming.length === 0) {
      return;
    }
    const label = incoming.length === 1 ? "Uploading 1 file…" : `Uploading ${incoming.length} files…`;
    await runUpload(async () => {
      const loose: File[] = [];
      const trees = new Map<string, File[]>();
      for (const file of incoming) {
        const relative = file.webkitRelativePath?.replaceAll("\\", "/") ?? "";
        if (relative.includes("/")) {
          const top = relative.split("/").filter(Boolean)[0] || "Folder";
          const group = trees.get(top) ?? [];
          group.push(file);
          trees.set(top, group);
        } else {
          loose.push(file);
        }
      }
      if (loose.length > 0) {
        const target = destinationId();
        if (target) {
          for (const file of loose) {
            await uploadAssetIntoFolder(target, assetFromFile(file));
          }
        }
      }
      for (const [name, group] of trees) {
        const root = createFolder(name, folderId);
        if (!root) {
          continue;
        }
        const made = new Map<string, string>([["", root]]);
        for (const file of group) {
          const parts = (file.webkitRelativePath || file.name).replaceAll("\\", "/").split("/").filter(Boolean);
          const inner = parts[0] === name ? parts.slice(1) : parts;
          let parent = root;
          let key = "";
          for (const dir of inner.slice(0, -1)) {
            key = key ? `${key}/${dir}` : dir;
            const existing = made.get(key);
            if (existing) {
              parent = existing;
              continue;
            }
            const created = createFolder(dir, parent);
            if (!created) {
              break;
            }
            made.set(key, created);
            parent = created;
          }
          await uploadAssetIntoFolder(parent, assetFromFile(file));
        }
      }
    }, label);
  }

  async function uploadFiles() {
    setUploadOpen(false);
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true });
    if (result.canceled || result.assets.length === 0) {
      return;
    }
    const target = destinationId();
    if (!target) {
      return;
    }
    const label = result.assets.length === 1 ? "Uploading 1 file…" : `Uploading ${result.assets.length} files…`;
    await runUpload(async () => {
      for (const asset of result.assets) {
        await uploadAssetIntoFolder(target, asset);
      }
    }, label);
  }

  async function uploadFolder() {
    setUploadOpen(false);
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
      input.onchange = () => {
        void placeFiles(Array.from(input.files ?? []));
      };
      input.click();
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true });
    if (result.canceled || result.assets.length === 0) {
      return;
    }
    const created = createFolder("Uploaded folder", folderId);
    if (!created) {
      return;
    }
    await runUpload(async () => {
      for (const asset of result.assets) {
        await uploadAssetIntoFolder(created, asset);
      }
    }, `Uploading ${result.assets.length} files…`);
    onOpenFolder(created);
  }

  function toggleVisible() {
    setSelected((current) =>
      allVisibleSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])],
    );
  }

  return (
    <View style={styles.fill}>
      <FileDropSurface label="Drop files to upload" onFiles={(files) => void placeFiles(files)} style={styles.fill}>
        <ScrollView
          contentContainerStyle={styles.page}
          onScrollBeginDrag={() => {
            setUploadOpen(false);
            setSortOpen(false);
            setPageSizeOpen(false);
          }}
        >
          {chain.length > 0 ? (
            <View style={styles.crumbs}>
              <Pressable accessibilityRole="button" accessibilityLabel="Files" onPress={() => onOpenFolder(null)} style={webPointer}>
                <Text style={[styles.crumbLink, font.ui]}>Files</Text>
              </Pressable>
              {chain.map((folder, index) => {
                const last = index === chain.length - 1;
                return (
                  <View key={folder.id} style={styles.crumbPart}>
                    <Text style={styles.crumbSep}>/</Text>
                    {last ? (
                      <View style={styles.crumbCurrentWrap}>
                        <Text style={[styles.crumbCurrent, font.ui]} numberOfLines={1}>
                          {folder.name}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${folder.name}`}
                          onPress={() => setDialog({ type: "folder-menu", folderId: folder.id, fromPath: true })}
                          style={webPointer}
                        >
                          <PencilIcon size={15} color={colors.ink} />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={folder.name}
                        onPress={() => onOpenFolder(folder.id)}
                        style={webPointer}
                      >
                        <Text style={[styles.crumbLink, font.ui]} numberOfLines={1}>
                          {folder.name}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.titleBlock}>
              <Text accessibilityRole="header" style={[styles.title, font.brand]}>
                Files
              </Text>
              <Text style={[styles.subtitle, font.content]}>Store, share, and manage files in your workspace.</Text>
            </View>
          )}

          <View style={styles.toolbar}>
            <View style={styles.search}>
              <SearchIcon size={16} color={colors.faint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search files & folders"
                placeholderTextColor={colors.faint}
                accessibilityLabel="Search files & folders"
                style={[styles.searchInput, font.ui]}
              />
            </View>
            <View style={styles.toolbarActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="New folder"
                onPress={() => {
                  setUploadOpen(false);
                  setDialog({ type: "create" });
                }}
                style={({ pressed }) => [styles.secondaryButton, webPointer, pressed && styles.pressed]}
              >
                <GeometricIcon name="folder" size={15} color={colors.navy} />
                <Text style={[styles.secondaryLabel, font.ui]}>New folder</Text>
              </Pressable>
              <View style={styles.uploadWrap}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Upload"
                  accessibilityState={{ expanded: uploadOpen }}
                  onPress={() => setUploadOpen((open) => !open)}
                  style={({ pressed }) => [styles.primaryButton, webPointer, pressed && styles.pressed]}
                >
                  <UploadGlyph />
                  <Text style={[styles.primaryLabel, font.ui]}>Upload</Text>
                  <Text style={styles.chevron}>▾</Text>
                </Pressable>
                {uploadOpen ? (
                  <View style={styles.uploadMenu}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Upload files"
                      onPress={() => void uploadFiles()}
                      style={({ pressed }) => [styles.uploadItem, webPointer, pressed && styles.menuPressed]}
                    >
                      <Text style={[styles.menuLabel, font.ui]}>Upload files</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Upload folder"
                      onPress={() => void uploadFolder()}
                      style={({ pressed }) => [styles.uploadItem, webPointer, pressed && styles.menuPressed]}
                    >
                      <Text style={[styles.menuLabel, font.ui]}>Upload folder</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {busyLabel ? <Text style={[styles.status, font.content]}>{busyLabel}</Text> : null}
          {notice ? <Text style={[styles.status, font.content]}>{notice}</Text> : null}

          <View style={styles.filterRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {categories.map((item) => {
                const active = category === item.id;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setCategory(item.id)}
                    style={[styles.filter, active && styles.filterActive, webPointer]}
                  >
                    <Text style={[styles.filterLabel, font.ui, active && styles.filterLabelActive]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.viewToggle}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="List view"
                accessibilityState={{ selected: mode === "list" }}
                onPress={() => setMode("list")}
                style={[styles.viewButton, mode === "list" && styles.viewButtonActive, webPointer]}
              >
                <ListGlyph active={mode === "list"} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Grid view"
                accessibilityState={{ selected: mode === "grid" }}
                onPress={() => setMode("grid")}
                style={[styles.viewButton, mode === "grid" && styles.viewButtonActive, webPointer]}
              >
                <GridGlyph active={mode === "grid"} />
              </Pressable>
            </View>
          </View>

          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, font.ui]}>Files</Text>
            <View style={styles.sectionTools}>
              {selected.length > 0 ? (
                <View style={styles.bulk}>
                  <Text style={[styles.bulkCount, font.ui]}>{selected.length} selected</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Move selected files" onPress={() => setDialog({ type: "move-files", fileIds: selected })} style={webPointer}>
                    <Text style={[styles.bulkAction, font.ui]}>Move</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Download selected files" onPress={() => setDialog({ type: "download-files", fileIds: selected })} style={webPointer}>
                    <Text style={[styles.bulkAction, font.ui]}>Download</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Delete selected files" onPress={() => setDialog({ type: "delete-files", fileIds: selected })} style={webPointer}>
                    <Text style={[styles.bulkDanger, font.ui]}>Delete</Text>
                  </Pressable>
                </View>
              ) : null}
              <View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Sort by ${sortKey === "name" ? "name" : "upload date"}`}
                  onPress={() => setSortOpen((open) => !open)}
                  style={webPointer}
                >
                  <Text style={[styles.sortLabel, font.ui]}>Sort: {sortKey === "name" ? "Name" : "Upload date"} ▾</Text>
                </Pressable>
                {sortOpen ? (
                  <View style={styles.sortMenu}>
                    <SortChoice
                      label="Name"
                      onPress={() => {
                        setSortKey("name");
                        setSortOpen(false);
                      }}
                    />
                    <SortChoice
                      label="Upload date"
                      onPress={() => {
                        setSortKey("uploaded");
                        setSortOpen(false);
                      }}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {listed.length === 0 ? (
            <Text style={[styles.empty, font.content]}>
              {query.trim() || category !== "all" ? "No matching files." : location ? "This folder is empty." : "No files here yet."}
            </Text>
          ) : mode === "grid" ? (
            <View style={styles.folderGrid}>
              {visible.map((row) =>
                row.kind === "folder" ? (
                  <FolderCard
                    key={row.folder.id}
                    folder={row.folder}
                    path={row.path}
                    itemCount={row.folder.files.length + childFolders(folders, row.folder.id).length}
                    choosing={selected.length > 0}
                    onOpen={() => onOpenFolder(row.folder.id)}
                    onMenu={() => setDialog({ type: "folder-menu", folderId: row.folder.id })}
                  />
                ) : (
                  <FileCard
                    key={row.file.id}
                    file={row.file}
                    path={row.path}
                    people={people}
                    choosing={selected.length > 0}
                    selected={selected.includes(row.file.id)}
                    active={selectedFileId === row.file.id}
                    onToggle={() =>
                      setSelected((current) =>
                        current.includes(row.file.id) ? current.filter((id) => id !== row.file.id) : [...current, row.file.id],
                      )
                    }
                    onOpen={() => onOpenFile(row.folderId, row.file.id)}
                    onMenu={() => setDialog({ type: "file-menu", folderId: row.folderId, fileId: row.file.id })}
                  />
                ),
              )}
            </View>
          ) : (
            <View style={styles.table}>
              <View style={styles.tableHead}>
                <CheckBox checked={allVisibleSelected} label="Select all files on this page" onPress={toggleVisible} />
                <Text style={[styles.columnLabel, styles.nameCol, font.ui]}>Name</Text>
                {compact ? null : <Text style={[styles.columnLabel, styles.typeCol, font.ui]}>Type</Text>}
                {narrow ? null : <Text style={[styles.columnLabel, styles.pathCol, font.ui]}>Folder</Text>}
                {narrow ? null : <Text style={[styles.columnLabel, styles.sharedCol, font.ui]}>Shared by</Text>}
                {narrow ? null : <Text style={[styles.columnLabel, styles.dateCol, font.ui]}>Upload Date</Text>}
                <View style={styles.menuCol} />
              </View>
              {visible.map((row) =>
                row.kind === "folder" ? (
                  <FolderRow
                    key={row.folder.id}
                    folder={row.folder}
                    path={row.path}
                    itemCount={row.folder.files.length + childFolders(folders, row.folder.id).length}
                    compact={compact}
                    narrow={narrow}
                    onOpen={() => onOpenFolder(row.folder.id)}
                    onMenu={() => setDialog({ type: "folder-menu", folderId: row.folder.id })}
                  />
                ) : (
                  <FileRow
                    key={row.file.id}
                    file={row.file}
                    path={row.path}
                    people={people}
                    compact={compact}
                    narrow={narrow}
                    checked={selected.includes(row.file.id)}
                    active={selectedFileId === row.file.id}
                    onToggle={() =>
                      setSelected((current) =>
                        current.includes(row.file.id) ? current.filter((id) => id !== row.file.id) : [...current, row.file.id],
                      )
                    }
                    onOpen={() => onOpenFile(row.folderId, row.file.id)}
                    onMenu={() => setDialog({ type: "file-menu", folderId: row.folderId, fileId: row.file.id })}
                  />
                ),
              )}
            </View>
          )}

          <View style={styles.pager}>
            <Text style={[styles.pagerLabel, font.ui]}>
              Page {listed.length === 0 ? 0 : safePage + 1} of {listed.length === 0 ? 0 : pageCount}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous page"
              disabled={safePage === 0}
              onPress={() => setPage((value) => Math.max(0, value - 1))}
              style={[styles.pagerButton, safePage === 0 && styles.disabled, webPointer]}
            >
              <Text style={styles.pagerGlyph}>‹</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next page"
              disabled={safePage >= pageCount - 1 || listed.length === 0}
              onPress={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
              style={[styles.pagerButton, (safePage >= pageCount - 1 || listed.length === 0) && styles.disabled, webPointer]}
            >
              <Text style={styles.pagerGlyph}>›</Text>
            </Pressable>
            <View style={styles.pageSizeWrap}>
              <Text style={[styles.pagerLabel, font.ui]}>Rows per page</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Rows per page"
                onPress={() => setPageSizeOpen((open) => !open)}
                style={[styles.pageSizeButton, webPointer]}
              >
                <Text style={[styles.pageSizeValue, font.ui]}>{pageSize}</Text>
                <Text style={styles.chevronDark}>▾</Text>
              </Pressable>
              {pageSizeOpen ? (
                <View style={styles.pageSizeMenu}>
                  {[10, 25].map((size) => (
                    <Pressable
                      key={size}
                      accessibilityRole="button"
                      accessibilityLabel={`${size} rows per page`}
                      onPress={() => {
                        setPageSize(size);
                        setPageSizeOpen(false);
                      }}
                      style={({ pressed }) => [styles.uploadItem, webPointer, pressed && styles.menuPressed]}
                    >
                      <Text style={[styles.menuLabel, font.ui]}>{size}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </FileDropSurface>
      <LibraryDialog
        dialog={dialog}
        folders={folders}
        onClose={() => setDialog(null)}
        onOpenFolder={onOpenFolder}
        onDialog={setDialog}
        onCreate={(name) => {
          const id = createFolder(name, folderId);
          setDialog(null);
          if (id) {
            onOpenFolder(id);
          }
        }}
      />
    </View>
  );
}

function LibraryDialog({
  dialog,
  folders,
  onClose,
  onOpenFolder,
  onDialog,
  onCreate,
}: {
  dialog: Dialog;
  folders: WorkspaceFolder[];
  onClose: () => void;
  onOpenFolder: (id: string | null) => void;
  onDialog: (dialog: Dialog) => void;
  onCreate: (name: string) => void;
}) {
  if (!dialog) {
    return null;
  }
  if (dialog.type === "file-menu" || dialog.type === "share") {
    return <FileActions dialog={dialog} folders={folders} onClose={onClose} onDialog={onDialog} />;
  }
  if (dialog.type === "create") {
    return <NameDialog title="New folder" label="Folder name" action="Create" onClose={onClose} onSave={onCreate} />;
  }
  if (dialog.type === "rename-folder") {
    const folder = folders.find((item) => item.id === dialog.folderId);
    return (
      <NameDialog
        title="Rename folder"
        label="Folder name"
        action="Save"
        initial={folder?.name ?? ""}
        onClose={onClose}
        onSave={(name) => {
          renameFolder(dialog.folderId, name);
          onClose();
        }}
      />
    );
  }
  if (dialog.type === "rename-file") {
    return (
      <NameDialog
        title="Rename file"
        label="File name"
        action="Save"
        initial={dialog.name}
        onClose={onClose}
        onSave={(name) => {
          renameFile(dialog.fileId, name);
          onClose();
        }}
      />
    );
  }
  if (dialog.type === "delete-folder") {
    const folder = folders.find((item) => item.id === dialog.folderId);
    return (
      <ConfirmDialog
        title="Delete folder?"
        body={`Delete ${folder?.name ?? "this folder"} and everything inside it?`}
        confirm="Delete"
        onClose={onClose}
        onConfirm={() => {
          deleteFolder(dialog.folderId);
          onClose();
        }}
      />
    );
  }
  if (dialog.type === "download-files") {
    const count = dialog.fileIds.length;
    const chosen = new Set(dialog.fileIds);
    const files = folders.flatMap((folder) => folder.files).filter((file) => chosen.has(file.id));
    return (
      <ConfirmDialog
        title={count === 1 ? "Download file?" : "Download files?"}
        body={count === 1 ? "Download 1 file?" : `Download these ${count} files?`}
        confirm="Yes"
        danger={false}
        onClose={onClose}
        onConfirm={() => {
          saveDownloads(
            files.flatMap((file) => {
              const url = fileDownloadUrl(file.id);
              return url ? [{ url, name: file.name }] : [];
            }),
          );
          onClose();
        }}
      />
    );
  }
  if (dialog.type === "delete-files") {
    const count = dialog.fileIds.length;
    return (
      <ConfirmDialog
        title={count === 1 ? "Delete file?" : "Delete files?"}
        body={count === 1 ? "This file will be removed from the workspace." : `Delete ${count} selected files?`}
        confirm="Delete"
        onClose={onClose}
        onConfirm={() => {
          for (const id of dialog.fileIds) {
            deleteFile(id);
          }
          onClose();
        }}
      />
    );
  }
  if (dialog.type === "move-folder") {
    const blocked = nestedFolderIds(folders, dialog.folderId);
    const current = folders.find((item) => item.id === dialog.folderId);
    const parent = current ? folderParentId(folders, current) : null;
    const targets = folders.filter((folder) => !blocked.has(folder.id));
    return (
      <ChoiceDialog title="Move folder" onClose={onClose}>
        {parent ? (
          <ChoiceRow
            label="Files"
            onPress={() => {
              moveFolder(dialog.folderId, null);
              onClose();
            }}
          />
        ) : null}
        {targets.map((folder) => (
          <ChoiceRow
            key={folder.id}
            label={folder.name}
            onPress={() => {
              moveFolder(dialog.folderId, folder.id);
              onClose();
            }}
          />
        ))}
        {targets.length === 0 && !parent ? <Text style={[styles.dialogNote, font.content]}>No other folders to move into.</Text> : null}
      </ChoiceDialog>
    );
  }
  if (dialog.type === "move-files") {
    return (
      <ChoiceDialog title="Move to folder" onClose={onClose}>
        {folders.map((folder) => (
          <ChoiceRow
            key={folder.id}
            label={folder.name}
            onPress={() => {
              for (const id of dialog.fileIds) {
                moveFile(id, folder.id);
              }
              onClose();
            }}
          />
        ))}
      </ChoiceDialog>
    );
  }
  const folder = folders.find((item) => item.id === dialog.folderId);
  return (
    <ChoiceDialog title={folder?.name ?? "Folder"} onClose={onClose}>
      {dialog.fromPath ? null : (
        <ChoiceRow
          label="Open"
          onPress={() => {
            onOpenFolder(dialog.folderId);
            onClose();
          }}
        />
      )}
      <ChoiceRow label="Rename" onPress={() => onDialog({ type: "rename-folder", folderId: dialog.folderId })} />
      <ChoiceRow label="Move" onPress={() => onDialog({ type: "move-folder", folderId: dialog.folderId })} />
      <ChoiceRow label="Delete" danger onPress={() => onDialog({ type: "delete-folder", folderId: dialog.folderId })} />
    </ChoiceDialog>
  );
}

function FileActions({
  dialog,
  folders,
  onClose,
  onDialog,
}: {
  dialog: Extract<Dialog, { type: "file-menu" | "share" }>;
  folders: WorkspaceFolder[];
  onClose: () => void;
  onDialog: (dialog: Dialog) => void;
}) {
  const router = useRouter();
  const { name } = useSession();
  const peers = useKnownPeers();
  const file = folders.flatMap((folder) => folder.files).find((item) => item.id === dialog.fileId);
  const rooms = getTransport().snapshot("rooms").rooms;
  if (!file) {
    return null;
  }
  if (dialog.type === "share") {
    return (
      <ChoiceDialog title={`Share ${file.name}`} onClose={onClose}>
        <Text style={[styles.shareHeading, font.ui]}>Share with a room</Text>
        {rooms.map((room) => (
          <ChoiceRow
            key={room.id}
            label={room.name}
            onPress={() => {
              shareFileToRoom(room.id, file, dialog.folderId, name);
              selectRoom(room.id);
              onClose();
              router.push("/rooms");
            }}
          />
        ))}
        <Text style={[styles.shareHeading, font.ui]}>Share with a person</Text>
        {peers
          .filter((peer) => peer.clientId !== currentClientId())
          .map((peer) => (
            <ChoiceRow
              key={peer.clientId}
              label={peer.displayName}
              onPress={() => {
                shareFileToPeer(peer.clientId, file, dialog.folderId, name);
                selectDirect(peer.clientId);
                onClose();
                router.push("/rooms");
              }}
            />
          ))}
      </ChoiceDialog>
    );
  }
  const downloadUrl = fileDownloadUrl(file.id);
  const others = folders.filter((folder) => folder.id !== dialog.folderId);
  return (
    <ChoiceDialog title={file.name} onClose={onClose}>
      {downloadUrl ? <FileDownload url={downloadUrl} name={file.name} tone="menu" /> : null}
      <ChoiceRow
        label={file.pinned ? "Unpin" : "Pin"}
        onPress={() => {
          pinFile(file.id, !file.pinned);
          onClose();
        }}
      />
      <ChoiceRow label="Rename" onPress={() => onDialog({ type: "rename-file", fileId: file.id, name: file.name })} />
      <ChoiceRow label="Share" onPress={() => onDialog({ type: "share", folderId: dialog.folderId, fileId: file.id, name: file.name })} />
      {others.length > 0 ? (
        <ChoiceRow label="Move" onPress={() => onDialog({ type: "move-files", fileIds: [file.id] })} />
      ) : null}
      <ChoiceRow label="Delete" danger onPress={() => onDialog({ type: "delete-files", fileIds: [file.id] })} />
    </ChoiceDialog>
  );
}

function FolderRow({
  folder,
  path,
  itemCount,
  compact,
  narrow,
  onOpen,
  onMenu,
}: {
  folder: WorkspaceFolder;
  path: string;
  itemCount: number;
  compact: boolean;
  narrow: boolean;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const count = itemCount === 1 ? "1 item" : `${itemCount} items`;
  return (
    <View style={styles.fileRow}>
      <View style={styles.checkHit} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Folder ${folder.name}`} onPress={onOpen} style={[styles.nameCol, webPointer]}>
        <GeometricIcon name="folder" size={18} color={colors.navy} />
        <View style={styles.fileCopy}>
          <Text style={[styles.fileName, font.ui]} numberOfLines={1}>
            {folder.name}
          </Text>
          <Text style={[styles.fileMeta, font.content]} numberOfLines={1}>
            {count}
          </Text>
        </View>
      </Pressable>
      {compact ? null : (
        <Text style={[styles.cell, styles.typeCol, styles.folderType, font.ui]} numberOfLines={1}>
          Folder
        </Text>
      )}
      {narrow ? null : (
        <Text style={[styles.cell, styles.pathCol, font.content]} numberOfLines={1}>
          {path}
        </Text>
      )}
      {narrow ? null : <Text style={[styles.cell, styles.sharedCol, font.content]}>—</Text>}
      {narrow ? null : <Text style={[styles.cell, styles.dateCol, font.content]}>—</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel={`Folder options for ${folder.name}`} onPress={onMenu} style={[styles.menuCol, webPointer]}>
        <Text style={styles.moreLabel}>•••</Text>
      </Pressable>
    </View>
  );
}

function FolderCard({
  folder,
  path,
  itemCount,
  choosing,
  onOpen,
  onMenu,
}: {
  folder: WorkspaceFolder;
  path: string;
  itemCount: number;
  choosing: boolean;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const count = itemCount === 1 ? "1 item" : `${itemCount} items`;
  return (
    <GridTile
      label={`Folder ${folder.name}`}
      menuLabel={`Folder options for ${folder.name}`}
      checkLabel={`Select ${folder.name}`}
      choosing={choosing}
      selected={false}
      active={false}
      onOpen={onOpen}
      onMenu={onMenu}
      preview={
        <View style={styles.gridFallback}>
          <GeometricIcon name="folder" size={28} color={colors.navy} />
        </View>
      }
      title={folder.name}
      meta={["Folder", count, path].filter(Boolean).join(" · ")}
    />
  );
}

function FileRow({
  file,
  path,
  people,
  compact,
  narrow,
  checked,
  active,
  onToggle,
  onOpen,
  onMenu,
}: {
  file: WorkspaceFile;
  path: string;
  people: People;
  compact: boolean;
  narrow: boolean;
  checked: boolean;
  active: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const owner = ownerOf(file, people);
  const size = typeof file.size === "number" ? formatBytes(file.size) : "";
  return (
    <View style={[styles.fileRow, active && styles.fileRowActive]}>
      <CheckBox checked={checked} label={`Select ${file.name}`} onPress={onToggle} />
      <Pressable accessibilityRole="button" accessibilityLabel={file.name} onPress={onOpen} style={[styles.nameCol, webPointer]}>
        <View style={styles.fileCopy}>
          <View style={styles.nameLine}>
            <Text style={[styles.fileName, styles.nameText, font.ui]} numberOfLines={1}>
              {file.name}
            </Text>
            {file.pinned ? <Text style={styles.pinMark} accessibilityLabel="Pinned">📌</Text> : null}
          </View>
          {size ? (
            <Text style={[styles.fileMeta, font.content]} numberOfLines={1}>
              {size}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {compact ? null : (
        <Text style={[styles.cell, styles.typeCol, font.content]} numberOfLines={1}>
          {displayType(file)}
        </Text>
      )}
      {narrow ? null : (
        <Text style={[styles.cell, styles.pathCol, font.content]} numberOfLines={1}>
          {path}
        </Text>
      )}
      {narrow ? null : (
        <View style={styles.sharedCol}>
          {owner ? (
            <View style={styles.shared}>
              <ProfileAvatar name={owner.name} photoUri={owner.photoUri} size={22} backgroundColor={colors.surfaceMuted} color={colors.navy} />
              <Text style={[styles.cell, font.content]} numberOfLines={1}>
                {owner.name}
              </Text>
            </View>
          ) : (
            <Text style={[styles.cell, font.content]}>—</Text>
          )}
        </View>
      )}
      {narrow ? null : (
        <Text style={[styles.cell, styles.dateCol, font.content]} numberOfLines={1}>
          {uploadDateLabel(file)}
        </Text>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel={`File options for ${file.name}`} onPress={onMenu} style={[styles.menuCol, webPointer]}>
        <Text style={styles.moreLabel}>•••</Text>
      </Pressable>
    </View>
  );
}

function TypeGlyph({ kind }: { kind: ReturnType<typeof filePreviewKind> }) {
  const color = colors.navy;
  if (kind === "image") {
    return (
      <View style={styles.typeFrame}>
        <View style={[styles.typeSun, { backgroundColor: color }]} />
        <View style={[styles.typeHill, { borderBottomColor: color }]} />
      </View>
    );
  }
  if (kind === "video") {
    return (
      <View style={[styles.typeFrame, styles.typeFrameCenter]}>
        <View style={[styles.typePlay, { borderLeftColor: color }]} />
      </View>
    );
  }
  if (kind === "audio") {
    return (
      <View style={styles.typeBars}>
        <View style={[styles.typeBar, { height: 10, backgroundColor: color }]} />
        <View style={[styles.typeBar, { height: 18, backgroundColor: color }]} />
        <View style={[styles.typeBar, { height: 14, backgroundColor: color }]} />
        <View style={[styles.typeBar, { height: 8, backgroundColor: color }]} />
      </View>
    );
  }
  return (
    <View style={[styles.typePage, kind === "pdf" && styles.typePagePdf]}>
      <View style={[styles.typeLine, { backgroundColor: kind === "pdf" ? colors.burgundy : color }]} />
      <View style={[styles.typeLine, styles.typeLineShort, { backgroundColor: kind === "pdf" ? colors.burgundy : color }]} />
      <View style={[styles.typeLine, { backgroundColor: kind === "pdf" ? colors.burgundy : color }]} />
    </View>
  );
}

function FileCard({
  file,
  path,
  people,
  choosing,
  selected,
  active,
  onToggle,
  onOpen,
  onMenu,
}: {
  file: WorkspaceFile;
  path: string;
  people: People;
  choosing: boolean;
  selected: boolean;
  active: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const size = typeof file.size === "number" ? formatBytes(file.size) : "";
  const owner = ownerOf(file, people);
  const kind = filePreviewKind(file.name, file.mimeType);
  return (
    <GridTile
      label={file.name}
      menuLabel={`File options for ${file.name}`}
      checkLabel={`Select ${file.name}`}
      choosing={choosing}
      selected={selected}
      active={active}
      onOpen={onOpen}
      onToggle={onToggle}
      onMenu={onMenu}
      preview={<CardPreview file={file} kind={kind} />}
      title={file.pinned ? `${file.name}  📌` : file.name}
      meta={[displayType(file), size, path, owner?.name].filter(Boolean).join(" · ")}
    />
  );
}

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(Platform.OS !== "web");
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia("(hover: none), (pointer: coarse)");
    const update = () => setCoarse(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return coarse;
}

function GridTile({
  label,
  menuLabel,
  checkLabel,
  choosing,
  selected,
  active,
  onOpen,
  onToggle,
  onMenu,
  preview,
  title,
  meta,
}: {
  label: string;
  menuLabel: string;
  checkLabel: string;
  choosing: boolean;
  selected: boolean;
  active: boolean;
  onOpen: () => void;
  onToggle?: () => void;
  onMenu: () => void;
  preview: ReactNode;
  title: string;
  meta: string;
}) {
  const ref = useRef<View>(null);
  const coarse = useCoarsePointer();
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const revealed = coarse || choosing || hover || focus || selected;

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }
    const node = ref.current as unknown as HTMLElement | null;
    if (!node) {
      return;
    }
    const enter = () => setHover(true);
    const leave = () => setHover(false);
    const focusIn = () => setFocus(true);
    const focusOut = (event: FocusEvent) => {
      if (!node.contains(event.relatedTarget as Node | null)) {
        setFocus(false);
      }
    };
    node.addEventListener("pointerenter", enter);
    node.addEventListener("pointerleave", leave);
    node.addEventListener("focusin", focusIn);
    node.addEventListener("focusout", focusOut);
    return () => {
      node.removeEventListener("pointerenter", enter);
      node.removeEventListener("pointerleave", leave);
      node.removeEventListener("focusin", focusIn);
      node.removeEventListener("focusout", focusOut);
    };
  }, []);

  return (
    <View ref={ref} style={[styles.gridCard, (active || selected) && styles.fileRowActive, hover && styles.gridCardHover]}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onOpen} style={styles.gridOpen}>
        <View style={styles.gridPreview}>{preview}</View>
        <View style={styles.gridCopy}>
          <Text style={[styles.gridName, font.ui]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[styles.gridMeta, font.content]} numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </Pressable>
      <View pointerEvents={revealed && onToggle ? "auto" : "none"} style={[styles.gridCheck, !revealed && styles.gridHidden]}>
        {onToggle ? <CheckBox checked={selected} label={checkLabel} onPress={onToggle} /> : null}
      </View>
      <View pointerEvents={revealed ? "auto" : "none"} style={[styles.gridMenu, !revealed && styles.gridHidden]}>
        <Pressable accessibilityRole="button" accessibilityLabel={menuLabel} onPress={onMenu} style={[styles.gridMenuButton, webPointer]}>
          <Text style={styles.moreLabel}>•••</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CardPreview({ file, kind }: { file: WorkspaceFile; kind: ReturnType<typeof filePreviewKind> }) {
  const url = fileDownloadUrl(file.id);
  const [failed, setFailed] = useState(false);
  const visual = Boolean(url) && !failed && (kind === "image" || kind === "video" || kind === "pdf");
  if (!visual || !url) {
    return (
      <View style={styles.gridFallback}>
        <TypeGlyph kind={kind} />
      </View>
    );
  }
  if (kind === "image") {
    return (
      <Image
        source={{ uri: url }}
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        onError={() => setFailed(true)}
        style={styles.gridMedia}
      />
    );
  }
  if (Platform.OS !== "web") {
    return (
      <View style={styles.gridFallback}>
        <TypeGlyph kind={kind} />
      </View>
    );
  }
  if (kind === "video") {
    return (
      <View style={styles.gridMedia}>
        {createElement("video", {
          src: `${url}#t=0.1`,
          muted: true,
          playsInline: true,
          preload: "metadata",
          onError: () => setFailed(true),
          style: { width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none", backgroundColor: "#1A2330" },
        })}
        <View style={styles.gridPlay}>
          <View style={[styles.typePlay, { borderLeftColor: colors.youText }]} />
        </View>
      </View>
    );
  }
  return createElement("iframe", {
    src: `${url}#page=1&view=FitH&toolbar=0&navpanes=0&scrollbar=0`,
    title: "",
    tabIndex: -1,
    onError: () => setFailed(true),
    style: {
      width: "100%",
      height: "168%",
      border: "none",
      pointerEvents: "none",
      backgroundColor: "#fff",
    },
  });
}

function CheckBox({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked }} onPress={onPress} style={[styles.checkHit, webPointer]}>
      <View style={[styles.check, checked && styles.checkOn]}>{checked ? <Text style={styles.checkMark}>✓</Text> : null}</View>
    </Pressable>
  );
}

function SortChoice({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.uploadItem, webPointer, pressed && styles.menuPressed]}>
      <Text style={[styles.menuLabel, font.ui]}>{label}</Text>
    </Pressable>
  );
}

function NameDialog({
  title,
  label,
  action,
  initial = "",
  onClose,
  onSave,
}: {
  title: string;
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
        <Text accessibilityRole="header" style={[text.title, font.brand]}>
          {title}
        </Text>
        <Text style={[styles.fieldLabel, font.ui]}>{label}</Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          autoFocus
          placeholder={label}
          placeholderTextColor={colors.faint}
          accessibilityLabel={label}
          onSubmitEditing={() => {
            if (name) {
              onSave(name);
            }
          }}
          style={[styles.nameInput, font.ui]}
        />
        <View style={styles.dialogActions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onClose} style={({ pressed }) => [styles.textButton, webPointer, pressed && styles.pressed]}>
            <Text style={[styles.textButtonLabel, font.ui]}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action}
            disabled={!name}
            onPress={() => onSave(name)}
            style={({ pressed }) => [styles.primaryButton, !name && styles.disabled, webPointer, pressed && name ? styles.pressed : null]}
          >
            <Text style={[styles.primaryLabel, font.ui]}>{action}</Text>
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
  danger = true,
  onClose,
  onConfirm,
}: {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Overlay onClose={onClose}>
      <View style={styles.dialog}>
        <Text accessibilityRole="header" style={[text.title, font.brand]}>
          {title}
        </Text>
        <Text style={[styles.dialogNote, font.content]}>{body}</Text>
        <View style={styles.dialogActions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onClose} style={({ pressed }) => [styles.textButton, webPointer, pressed && styles.pressed]}>
            <Text style={[styles.textButtonLabel, font.ui]}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={confirm}
            onPress={onConfirm}
            style={({ pressed }) => [danger ? styles.dangerButton : styles.confirmButton, webPointer, pressed && styles.pressed]}
          >
            <Text style={[styles.primaryLabel, font.ui]}>{confirm}</Text>
          </Pressable>
        </View>
      </View>
    </Overlay>
  );
}

function ChoiceDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Overlay onClose={onClose}>
      <View style={styles.menu}>
        <Text style={[styles.menuTitle, font.ui]} numberOfLines={1}>
          {title}
        </Text>
        <ScrollView style={styles.menuScroll}>{children}</ScrollView>
      </View>
    </Overlay>
  );
}

function ChoiceRow({ label, danger, onPress }: { label: string; danger?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.uploadItem, webPointer, pressed && styles.menuPressed]}>
      <Text style={[danger ? styles.menuDanger : styles.menuLabel, font.ui]}>{label}</Text>
    </Pressable>
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

function UploadGlyph() {
  return (
    <View style={styles.glyph}>
      <View style={styles.glyphStem} />
      <View style={styles.glyphHead} />
    </View>
  );
}

function ListGlyph({ active }: { active: boolean }) {
  const color = active ? colors.ink : colors.faint;
  return (
    <View style={styles.listGlyph}>
      <View style={[styles.listLine, { backgroundColor: color }]} />
      <View style={[styles.listLine, { backgroundColor: color }]} />
      <View style={[styles.listLine, { backgroundColor: color }]} />
    </View>
  );
}

function GridGlyph({ active }: { active: boolean }) {
  const color = active ? colors.ink : colors.faint;
  return (
    <View style={styles.gridGlyph}>
      <View style={[styles.gridDot, { backgroundColor: color }]} />
      <View style={[styles.gridDot, { backgroundColor: color }]} />
      <View style={[styles.gridDot, { backgroundColor: color }]} />
      <View style={[styles.gridDot, { backgroundColor: color }]} />
    </View>
  );
}

function folderLocation(folders: WorkspaceFolder[], folderId: string) {
  const folder = folders.find((item) => item.id === folderId);
  if (!folder) {
    return "Files";
  }
  const parentId = folderParentId(folders, folder);
  const parent = parentId ? folders.find((item) => item.id === parentId) : null;
  return parent?.name ?? "Files";
}

function filePath(folders: WorkspaceFolder[], folderId: string) {
  return folders.find((folder) => folder.id === folderId)?.name ?? "Files";
}

function fileCategory(file: WorkspaceFile): Category {
  const kind = filePreviewKind(file.name, file.mimeType);
  if (kind === "image") {
    return "images";
  }
  if (kind === "video") {
    return "videos";
  }
  if (kind === "audio") {
    return "audio";
  }
  if (kind === "pdf" || kind === "text" || /\.(docx?|xlsx?|pptx?|csv|rtf|pages|numbers|key)$/i.test(file.name)) {
    return "documents";
  }
  return "other";
}

function displayType(file: WorkspaceFile) {
  if (/\.(xlsx?|csv|numbers|tsv)$/i.test(file.name)) {
    return "Spreadsheet";
  }
  const kind = filePreviewKind(file.name, file.mimeType);
  if (kind === "image") {
    return "Image";
  }
  if (kind === "video") {
    return "Video";
  }
  if (kind === "audio") {
    return "Audio";
  }
  if (kind === "pdf") {
    return "PDF";
  }
  if (kind === "text" || /\.(docx?|pptx?|pages|rtf)$/i.test(file.name)) {
    return "Document";
  }
  return "Other";
}

function uploadTime(file: WorkspaceFile) {
  if (file.uploadedAt) {
    const parsed = Date.parse(file.uploadedAt);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  const created = /^file-(\d{13})/.exec(file.id);
  if (created) {
    const parsed = Number(created[1]);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function uploadDateLabel(file: WorkspaceFile) {
  const time = uploadTime(file);
  if (time === null) {
    return "—";
  }
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function compareFiles(left: WorkspaceFile, right: WorkspaceFile, sortKey: SortKey) {
  if (sortKey === "uploaded") {
    const leftTime = uploadTime(left) ?? 0;
    const rightTime = uploadTime(right) ?? 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
  }
  return left.name.localeCompare(right.name);
}

function ownerOf(file: WorkspaceFile, people: People) {
  if (!file.clientId) {
    return null;
  }
  if (file.clientId === systemClientId) {
    return { clientId: file.clientId, name: systemDisplayName };
  }
  if (file.clientId === people.self) {
    return { clientId: file.clientId, name: "You", photoUri: people.selfPhoto };
  }
  const peer = people.peers.find((item) => item.clientId === file.clientId);
  return {
    clientId: file.clientId,
    name: peer?.displayName || "Someone",
    photoUri: peer?.photoUri,
  };
}

function ownerName(file: WorkspaceFile, people: People) {
  const owner = ownerOf(file, people);
  if (!owner) {
    return "";
  }
  if (owner.name === "You") {
    return `you ${people.selfName}`;
  }
  return owner.name;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  page: {
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 28,
    gap: 16,
  },
  titleBlock: {
    gap: 4,
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  crumbs: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    minHeight: 34,
  },
  crumbPart: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 240,
  },
  crumbLink: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  crumbCurrent: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  crumbSep: {
    color: colors.faint,
    fontSize: 14,
  },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    zIndex: 3,
  },
  search: {
    flexGrow: 1,
    flexBasis: 280,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 8,
  },
  toolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  secondaryButton: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  secondaryLabel: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  primaryButton: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.navy,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryLabel: {
    color: colors.youText,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  chevron: {
    color: colors.youText,
    fontSize: 11,
    lineHeight: 14,
  },
  chevronDark: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 14,
  },
  uploadWrap: {
    position: "relative",
    zIndex: 4,
  },
  uploadMenu: {
    position: "absolute",
    top: 44,
    right: 0,
    width: 180,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: "hidden",
    zIndex: 5,
  },
  uploadItem: {
    minHeight: 40,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  menuPressed: {
    backgroundColor: colors.canvas,
  },
  menuLabel: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  menuDanger: {
    color: colors.burgundy,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  status: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  filters: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 8,
  },
  filter: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  filterActive: {
    backgroundColor: colors.surfaceMuted,
  },
  filterLabel: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  filterLabelActive: {
    color: colors.ink,
  },
  viewToggle: {
    flexDirection: "row",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  viewButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  viewButtonActive: {
    backgroundColor: colors.surfaceMuted,
  },
  crumbCurrentWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    zIndex: 2,
  },
  sectionTools: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  sortLabel: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  sortMenu: {
    position: "absolute",
    top: 24,
    right: 0,
    width: 140,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    zIndex: 5,
  },
  empty: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  folderGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    ...(Platform.OS === "web"
      ? ({ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(176px, 1fr))", alignItems: "stretch" } as unknown as ViewStyle)
      : null),
  },
  gridCard: {
    width: Platform.OS === "web" ? "100%" : "47%",
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: "hidden",
    position: "relative",
  },
  gridCardHover: {
    borderColor: colors.muted,
  },
  gridOpen: {
    minWidth: 0,
  },
  gridPreview: {
    height: 112,
    backgroundColor: colors.canvas,
    overflow: "hidden",
  },
  gridMedia: {
    width: "100%",
    height: "100%",
  },
  gridFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  gridPlay: {
    position: "absolute",
    left: 8,
    bottom: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(20, 32, 51, 0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  gridCopy: {
    minWidth: 0,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 2,
  },
  gridName: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    minHeight: 36,
  },
  gridMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  gridCheck: {
    position: "absolute",
    top: 2,
    left: 2,
    zIndex: 2,
  },
  gridMenu: {
    position: "absolute",
    top: 4,
    right: 4,
    zIndex: 2,
  },
  gridMenuButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  gridHidden: {
    opacity: 0,
  },
  typeFrame: {
    width: 28,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.navy,
    overflow: "hidden",
    position: "relative",
  },
  typeFrameCenter: {
    alignItems: "center",
    justifyContent: "center",
  },
  typeSun: {
    position: "absolute",
    top: 3,
    right: 4,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  typeHill: {
    position: "absolute",
    left: 3,
    bottom: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  typePlay: {
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 8,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    marginLeft: 2,
  },
  typeBars: {
    width: 28,
    height: 22,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 3,
  },
  typeBar: {
    width: 3,
    borderRadius: 2,
  },
  typePage: {
    width: 22,
    height: 26,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: colors.navy,
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 4,
  },
  typePagePdf: {
    borderColor: colors.burgundy,
  },
  typeLine: {
    height: 2,
    borderRadius: 1,
  },
  typeLineShort: {
    width: "70%",
  },
  folderCard: {
    flexGrow: 1,
    flexBasis: 210,
    minWidth: 180,
    maxWidth: 320,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 12,
  },
  folderMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  folderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  folderName: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  folderMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  folderFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 24,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarOverlap: {
    marginLeft: -6,
  },
  more: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  moreLabel: {
    color: colors.faint,
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: 1,
  },
  bulk: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bulkCount: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  bulkAction: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  bulkDanger: {
    color: colors.burgundy,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  table: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  tableHead: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  columnLabel: {
    color: colors.faint,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  fileRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  fileRowActive: {
    backgroundColor: colors.burgundySoft,
  },
  nameCol: {
    flex: 1.6,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  typeCol: {
    flex: 0.7,
    minWidth: 72,
  },
  pathCol: {
    flex: 1,
    minWidth: 120,
  },
  sharedCol: {
    flex: 0.9,
    minWidth: 110,
  },
  dateCol: {
    flex: 0.8,
    minWidth: 110,
  },
  menuCol: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  fileCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  folderType: {
    color: colors.navy,
    fontWeight: "600",
  },
  nameLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  nameText: {
    flexShrink: 1,
  },
  pinMark: {
    fontSize: 14,
    lineHeight: 18,
  },
  fileName: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  fileMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  cell: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  shared: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  checkHit: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  check: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  checkMark: {
    color: colors.youText,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    paddingTop: 8,
  },
  pagerLabel: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  pagerButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  pagerGlyph: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 20,
  },
  pageSizeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 8,
    position: "relative",
  },
  pageSizeButton: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pageSizeValue: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
  },
  pageSizeMenu: {
    position: "absolute",
    right: 0,
    bottom: 36,
    width: 80,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    zIndex: 5,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.72,
  },
  scrim: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20, 32, 51, 0.28)",
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
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 20,
    gap: 12,
  },
  dialogNote: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  nameInput: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    color: colors.ink,
    fontSize: 14,
  },
  dialogActions: {
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
    color: colors.muted,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  dangerButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.burgundy,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  menu: {
    width: "100%",
    maxWidth: 320,
    maxHeight: 420,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  menuTitle: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  menuScroll: {
    flexGrow: 0,
  },
  shareHeading: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  glyph: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  glyphStem: {
    width: 2,
    height: 8,
    backgroundColor: colors.youText,
  },
  glyphHead: {
    position: "absolute",
    top: 1,
    width: 8,
    height: 8,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: colors.youText,
    transform: [{ rotate: "45deg" }],
  },
  listGlyph: {
    width: 14,
    gap: 2,
  },
  listLine: {
    height: 2,
    borderRadius: 1,
  },
  gridGlyph: {
    width: 12,
    height: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
  },
  gridDot: {
    width: 5,
    height: 5,
    borderRadius: 1,
  },
});
