import { useRouter } from "expo-router";
import { createElement, useEffect, useState } from "react";
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import type { SharedFileRef } from "@/domain/types";
import { FileDownload } from "@/features/files/FileDownload";
import { organizeFile } from "@/features/files/fileActions";
import { fileTypeLabel, formatBytes, isImageFile, isPdfFile, isTextFile, isVideoFile } from "@/features/files/fileKind";
import { fileDownloadUrl } from "@/features/files/downloads";
import { requestOpenFile } from "@/features/files/openFile";
import { dismissOrganize, isOrganizeDismissed, subscribeOrganizeDismiss } from "@/features/files/organizeDismiss";
import { folderForFile, useFolders } from "@/features/files/useFolders";
import { CloseIcon } from "@/components/PreviewIcons";
import { webMotion, webPointer } from "@/theme/pressable";
import { colors, font, layout } from "@/theme/tokens";

export function SharedFileCard({
  file,
  solo = false,
  suggest = false,
}: {
  file: SharedFileRef;
  solo?: boolean;
  suggest?: boolean;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const folders = useFolders();
  const chatInset = width >= layout.desktopMinWidth ? layout.railWidth + layout.contextWidth : 0;
  const [, setDismissedTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [previewPicking, setPreviewPicking] = useState(false);
  const [savedName, setSavedName] = useState("");
  const [previewText, setPreviewText] = useState("");
  const folder = folderForFile(file.fileId);
  const downloadUrl = fileDownloadUrl(file.fileId);
  const image = isImageFile(file.name, file.mimeType);
  const textFile = isTextFile(file.name, file.mimeType);
  const pdf = isPdfFile(file.name, file.mimeType);
  const video = isVideoFile(file.name, file.mimeType);
  const dismissed = isOrganizeDismissed(file.fileId);
  const showPrompt = suggest && !folder && !dismissed && !savedName;
  const typeLabel = fileTypeLabel(file.name, file.mimeType).slice(0, 4);
  const badge = badgeTone(file.name, file.mimeType);
  const sizeLabel = typeof file.size === "number" ? formatBytes(file.size) : typeLabel;
  const canShowMedia = Boolean(downloadUrl) && ((pdf || video) && Platform.OS === "web" || image || textFile);

  useEffect(() => subscribeOrganizeDismiss(() => setDismissedTick((value) => value + 1)), []);

  useEffect(() => {
    if (!savedName) {
      return;
    }
    const timer = setTimeout(() => setSavedName(""), 2500);
    return () => clearTimeout(timer);
  }, [savedName]);

  useEffect(() => {
    if (!open || !textFile || !downloadUrl) {
      return;
    }
    let cancel = false;
    setPreviewText("");
    fetch(downloadUrl)
      .then((response) => response.text())
      .then((value) => {
        if (cancel) {
          return;
        }
        if (!value.trim()) {
          setPreviewText("This file is empty.");
          return;
        }
        setPreviewText(value.length > 8000 ? `${value.slice(0, 8000)}\n\n…` : value);
      })
      .catch(() => {
        if (!cancel) {
          setPreviewText("This file can't be previewed.");
        }
      });
    return () => {
      cancel = true;
    };
  }, [open, textFile, downloadUrl]);

  function closePreview() {
    setOpen(false);
    setMenu(false);
    setPreviewPicking(false);
  }

  function openInFiles() {
    const target = folderForFile(file.fileId);
    if (!target) {
      return;
    }
    closePreview();
    requestOpenFile(target.id, file.fileId);
    router.push("/files");
  }

  function saveTo(folderId: string) {
    const destination = folders.find((item) => item.id === folderId);
    if (!destination) {
      return;
    }
    organizeFile(file.fileId, destination.id);
    setPreviewPicking(false);
    setMenu(false);
    setSavedName(destination.name);
  }

  return (
    <View style={[styles.wrap, solo && styles.solo, suggest && styles.wrapMine]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Preview ${file.name}`}
        onPress={() => setOpen(true)}
        style={({ pressed, hovered }) => [
          styles.card,
          suggest && styles.cardMine,
          webPointer,
          webMotion,
          hovered && styles.cardHover,
          pressed && styles.pressed,
        ]}
      >
        {image && downloadUrl ? <CardThumb url={downloadUrl} /> : (
          <View style={[styles.typeMark, { backgroundColor: badge.backgroundColor }]}>
            <Text style={[styles.typeLabel, { color: badge.color }]}>{typeLabel}</Text>
          </View>
        )}
        <View style={styles.copy}>
          <Text style={styles.name} numberOfLines={1}>
            {file.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {folder ? `${sizeLabel} · In ${folder.name}` : savedName ? `${sizeLabel} · Saved to ${savedName}` : sizeLabel}
          </Text>
        </View>
      </Pressable>
      {showPrompt ? (
        <View style={[styles.saveBlock, suggest && styles.saveBlockMine]}>
          <View style={styles.prompt}>
            <Text style={styles.promptLabel}>Save to Files?</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Not now"
              onPress={() => dismissOrganize(file.fileId)}
              style={({ pressed }) => [webPointer, pressed && styles.pressed]}
            >
              <Text style={styles.quiet}>Not now</Text>
            </Pressable>
          </View>
          <FolderPicker folders={folders} mine={suggest} onSave={saveTo} />
        </View>
      ) : null}
      {savedName ? <Text style={[styles.saved, suggest && styles.savedMine]}>Saved to {savedName}</Text> : null}
      <Modal visible={open} transparent animationType="fade" onRequestClose={closePreview}>
        <View style={[styles.scrim, { paddingLeft: 24 + chatInset }]}>
          <Pressable accessibilityLabel="Close" style={styles.scrimDismiss} onPress={closePreview} />
          <View style={styles.panel}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewName} numberOfLines={1}>
                {file.name}
              </Text>
              <View style={styles.previewActions}>
                {folder ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${file.name} in ${folder.name}`}
                    onPress={openInFiles}
                    style={({ pressed, hovered }) => [styles.open, webPointer, (pressed || hovered) && styles.cardHover]}
                  >
                    <Text style={styles.choose}>Open in {folder.name}</Text>
                  </Pressable>
                ) : null}
                {downloadUrl ? <FileDownload url={downloadUrl} name={file.name} tone="icon" /> : null}
                {folder ? null : (
                  <View style={styles.moreAnchor}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Attachment options for ${file.name}`}
                      onPress={() => {
                        setPreviewPicking(false);
                        setMenu((value) => !value);
                      }}
                      style={({ pressed, hovered }) => [styles.more, webPointer, (pressed || hovered) && styles.cardHover]}
                    >
                      <Text style={styles.moreLabel}>•••</Text>
                    </Pressable>
                    {menu ? (
                      <View style={styles.menu}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Add ${file.name} to Files`}
                          onPress={() => {
                            setMenu(false);
                            setPreviewPicking(true);
                          }}
                          style={({ pressed, hovered }) => [styles.menuItem, webPointer, (pressed || hovered) && styles.cardHover]}
                        >
                          <Text style={styles.menuLabel}>Add to Files</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close preview"
                  onPress={closePreview}
                  style={({ pressed, hovered }) => [styles.more, webPointer, (pressed || hovered) && styles.cardHover]}
                >
                  <CloseIcon />
                </Pressable>
              </View>
            </View>
            {previewPicking && !folder ? <FolderPicker folders={folders} onSave={saveTo} /> : null}
            <View style={styles.previewBody}>
              {image && downloadUrl ? <PreviewImage url={downloadUrl} /> : null}
              {pdf && downloadUrl && Platform.OS === "web" ? <WebMedia kind="pdf" url={downloadUrl} name={file.name} /> : null}
              {video && downloadUrl && Platform.OS === "web" ? <WebMedia kind="video" url={downloadUrl} name={file.name} /> : null}
              {textFile && downloadUrl ? (
                <ScrollView style={styles.previewScroll}>
                  <Text style={styles.previewText}>{previewText || "Opening preview…"}</Text>
                </ScrollView>
              ) : null}
              {!canShowMedia ? (
                <View style={styles.info}>
                  <Text style={styles.name}>{file.name}</Text>
                  <Text style={styles.meta}>
                    {typeLabel}
                    {typeof file.size === "number" ? ` · ${formatBytes(file.size)}` : ""}
                  </Text>
                  <Text style={styles.meta}>{downloadUrl ? "This file can't be previewed." : "This file isn't available right now."}</Text>
                  {downloadUrl ? <FileDownload url={downloadUrl} name={file.name} tone="icon" /> : null}
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FolderPicker({
  folders,
  mine = false,
  onSave,
}: {
  folders: { id: string; name: string }[];
  mine?: boolean;
  onSave: (id: string) => void;
}) {
  if (folders.length === 0) {
    return <Text style={styles.meta}>No folders yet</Text>;
  }
  return (
    <View style={[styles.folderRow, mine && styles.folderRowMine]}>
      {folders.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`Save to ${item.name}`}
          onPress={() => onSave(item.id)}
          style={({ pressed, hovered }) => [
            styles.folderChip,
            (pressed || hovered) && styles.folderChipOn,
            webPointer,
          ]}
        >
          <Text style={styles.folderLabel}>{item.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function badgeTone(name: string, mimeType?: string | null) {
  if (isImageFile(name, mimeType)) {
    return { backgroundColor: "#E6F0E8", color: "#3E684C" };
  }
  if (isPdfFile(name, mimeType)) {
    return { backgroundColor: "#F6E7E4", color: "#8A4E46" };
  }
  if (isVideoFile(name, mimeType)) {
    return { backgroundColor: "#E8E6F1", color: "#514C72" };
  }
  if (isTextFile(name, mimeType)) {
    return { backgroundColor: "#E7EEF4", color: "#3E5168" };
  }
  return { backgroundColor: "#EFE6D8", color: "#6A5844" };
}

function CardThumb({ url }: { url: string }) {
  if (Platform.OS === "web") {
    return createElement("img", {
      src: url,
      alt: "",
      style: { width: 36, height: 36, objectFit: "cover", borderRadius: 6, display: "block" },
    });
  }
  return <Image source={{ uri: url }} accessibilityIgnoresInvertColors resizeMode="cover" style={styles.thumb} />;
}

function PreviewImage({ url }: { url: string }) {
  if (Platform.OS === "web") {
    return createElement("img", {
      src: url,
      alt: "",
      style: {
        display: "block",
        width: "100%",
        height: 520,
        objectFit: "contain",
        backgroundColor: "transparent",
      },
    });
  }
  return <Image source={{ uri: url }} accessibilityIgnoresInvertColors resizeMode="contain" style={styles.previewImage} />;
}

function WebMedia({ kind, url, name }: { kind: "pdf" | "video"; url: string; name: string }) {
  if (kind === "video") {
    return createElement("video", {
      src: url,
      controls: true,
      style: { width: "100%", maxHeight: 560, borderRadius: 8, backgroundColor: colors.background },
    });
  }
  return createElement("iframe", {
    src: url,
    title: name,
    style: { width: "100%", height: 560, border: "none", borderRadius: 8, backgroundColor: colors.background },
  });
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    gap: 8,
    maxWidth: "100%",
    alignSelf: "flex-start",
  },
  wrapMine: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  solo: {
    marginTop: 0,
  },
  card: {
    maxWidth: 280,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: "transparent",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  cardMine: {
    alignSelf: "flex-end",
  },
  cardHover: {
    backgroundColor: "#F8F3EC",
  },
  thumb: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: "transparent",
  },
  typeMark: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  typeLabel: {
    ...font.ui,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "600",
  },
  copy: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    ...font.content,
    color: colors.navy,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "500",
  },
  meta: {
    ...font.content,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },
  saveBlock: {
    gap: 8,
    maxWidth: "100%",
  },
  saveBlockMine: {
    alignItems: "flex-end",
  },
  prompt: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  promptLabel: {
    ...font.content,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },
  quiet: {
    ...font.ui,
    color: colors.faint,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  choose: {
    ...font.ui,
    color: colors.navy,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  folderRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  folderRowMine: {
    justifyContent: "flex-end",
  },
  folderChip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  folderChipOn: {
    backgroundColor: colors.burgundySoft,
    borderColor: "rgba(122, 48, 64, 0.35)",
  },
  folderLabel: {
    ...font.ui,
    color: colors.navy,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  saved: {
    ...font.content,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },
  savedMine: {
    textAlign: "right",
  },
  scrim: {
    flex: 1,
    backgroundColor: "rgba(20, 32, 51, 0.28)",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 24,
    paddingRight: 24,
    paddingBottom: 24,
  },
  scrimDismiss: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  panel: {
    width: "100%",
    maxWidth: 760,
    maxHeight: "86%",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: 16,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  previewName: {
    ...font.content,
    flex: 1,
    minWidth: 0,
    color: colors.navy,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "500",
  },
  previewActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  moreAnchor: {
    position: "relative",
  },
  more: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  moreLabel: {
    ...font.ui,
    color: colors.faint,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "600",
  },
  open: {
    height: 28,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  menu: {
    position: "absolute",
    right: 0,
    bottom: "100%",
    marginBottom: 6,
    zIndex: 4,
    minWidth: 160,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  menuItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  menuLabel: {
    ...font.ui,
    color: colors.navy,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  previewBody: {
    minHeight: 160,
  },
  previewImage: {
    width: "100%",
    height: 520,
    backgroundColor: "transparent",
  },
  previewScroll: {
    maxHeight: 520,
  },
  previewText: {
    ...font.content,
    color: colors.navy,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "400",
    textAlign: "left",
  },
  info: {
    gap: 8,
    paddingVertical: 12,
  },
  pressed: {
    opacity: 0.72,
  },
});
