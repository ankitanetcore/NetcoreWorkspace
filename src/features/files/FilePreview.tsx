import { createElement, useEffect, useRef, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { GeometricIcon } from "@/components/GeometricIcon";
import type { WorkspaceFile } from "@/domain/types";
import { FileDownload } from "@/features/files/FileDownload";
import { filePreviewKind, fileTypeLabel, formatBytes, previewByteLimit } from "@/features/files/fileKind";
import { colors, text } from "@/theme/tokens";

const binaryNotes = new Set(["This file isn't opened as text.", "This file is saved on this device. It isn't opened as text."]);

export function storedText(file: WorkspaceFile) {
  if (binaryNotes.has(file.body)) {
    return "";
  }
  return file.body;
}

export function FilePreview({
  file,
  url,
  unavailable,
}: {
  file: WorkspaceFile;
  url: string | null;
  unavailable: string | null;
}) {
  const kind = filePreviewKind(file.name, file.mimeType);
  const tooLarge = kind !== "unsupported" && typeof file.size === "number" && file.size > previewByteLimit[kind];

  if (tooLarge) {
    return (
      <PreviewNotice
        title="This file is too large to preview."
        file={file}
        url={url}
      />
    );
  }

  if (kind === "unsupported") {
    return <PreviewNotice title="This file can't be previewed." file={file} url={url} icon />;
  }

  if (!url && kind !== "text") {
    return <PreviewNotice title={unavailable || "Opening preview…"} file={file} url={url} quiet={!unavailable} />;
  }

  if (kind === "text") {
    return <TextPreview file={file} url={url} unavailable={unavailable} />;
  }

  if (!url) {
    return <PreviewNotice title={unavailable || "Opening preview…"} file={file} url={null} quiet={!unavailable} />;
  }

  if (Platform.OS !== "web") {
    if (kind === "image") {
      return (
        <View style={styles.stage}>
          <Image source={{ uri: url }} accessibilityIgnoresInvertColors resizeMode="contain" style={styles.nativeImage} />
        </View>
      );
    }
    return <PreviewNotice title="Preview unavailable" file={file} url={url} />;
  }

  if (kind === "image") {
    return <ImagePreview url={url} name={file.name} file={file} />;
  }
  if (kind === "video") {
    return <VideoPreview url={url} file={file} />;
  }
  if (kind === "audio") {
    return <AudioPreview url={url} file={file} />;
  }
  return <PdfPreview url={url} name={file.name} file={file} />;
}

function TextPreview({
  file,
  url,
  unavailable,
}: {
  file: WorkspaceFile;
  url: string | null;
  unavailable: string | null;
}) {
  const initial = storedText(file);
  const [value, setValue] = useState<string | null>(initial ? initial : null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (initial || !url) {
      return;
    }
    let cancel = false;
    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error("preview");
        }
        return response.text();
      })
      .then((next) => {
        if (!cancel) {
          setValue(next);
        }
      })
      .catch(() => {
        if (!cancel) {
          setFailed(true);
        }
      });
    return () => {
      cancel = true;
    };
  }, [initial, url]);

  if (failed) {
    return <PreviewNotice title="Preview unavailable" file={file} url={url} />;
  }
  if (value === null) {
    return <PreviewNotice title={unavailable || "Opening preview…"} file={file} url={url} quiet={!unavailable} />;
  }

  const content = value || "This file is empty.";
  if (Platform.OS === "web") {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.textContent}>
        {createElement(
          "pre",
          {
            style: {
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "inherit",
              fontSize: 15,
              lineHeight: "22px",
              color: colors.ink,
            },
          },
          content,
        )}
      </ScrollView>
    );
  }
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.textContent}>
      <Text style={text.body}>{content}</Text>
    </ScrollView>
  );
}

function ImagePreview({ url, name, file }: { url: string; name: string; file: WorkspaceFile }) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  if (failed) {
    return <PreviewNotice title="Preview unavailable" file={file} url={url} />;
  }
  return (
    <View style={styles.stage}>
      {ready ? null : <Text style={styles.loading}>Opening preview…</Text>}
      {createElement("img", {
        src: url,
        alt: name,
        onLoad: () => setReady(true),
        onError: () => setFailed(true),
        style: {
          display: ready ? "block" : "none",
          width: "100%",
          height: "100%",
          objectFit: "contain",
        },
      })}
    </View>
  );
}

function useMediaElement(url: string) {
  const ref = useRef<HTMLMediaElement | null>(null);
  useEffect(() => {
    const node = ref.current;
    return () => {
      if (!node) {
        return;
      }
      node.pause();
      node.removeAttribute("src");
      node.load();
    };
  }, [url]);
  return ref;
}

function VideoPreview({ url, file }: { url: string; file: WorkspaceFile }) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const media = useMediaElement(url);
  if (failed) {
    return <PreviewNotice title="Preview unavailable" file={file} url={url} />;
  }
  return (
    <View style={styles.stage}>
      {ready ? null : <Text style={styles.loading}>Opening preview…</Text>}
      {createElement("video", {
        src: url,
        controls: true,
        playsInline: true,
        onLoadedData: () => setReady(true),
        onError: () => setFailed(true),
        style: {
          display: ready ? "block" : "none",
          width: "100%",
          height: "100%",
          objectFit: "contain",
          backgroundColor: "transparent",
        },
        ref: (node: HTMLVideoElement | null) => {
          media.current = node;
        },
      })}
    </View>
  );
}

function AudioPreview({ url, file }: { url: string; file: WorkspaceFile }) {
  const [failed, setFailed] = useState(false);
  const media = useMediaElement(url);
  if (failed) {
    return <PreviewNotice title="Preview unavailable" file={file} url={url} />;
  }
  return (
    <View style={styles.stage}>
      {createElement("audio", {
        src: url,
        controls: true,
        onError: () => setFailed(true),
        style: { width: "100%", maxWidth: 320 },
        ref: (node: HTMLAudioElement | null) => {
          media.current = node;
        },
      })}
    </View>
  );
}

function PdfPreview({ url, name, file }: { url: string; name: string; file: WorkspaceFile }) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  if (failed) {
    return <PreviewNotice title="Preview unavailable" file={file} url={url} />;
  }
  return (
    <View style={styles.stage}>
      {ready ? null : <Text style={styles.loading}>Opening preview…</Text>}
      {createElement("iframe", {
        src: url,
        title: name,
        onLoad: () => setReady(true),
        onError: () => setFailed(true),
        style: {
          display: ready ? "block" : "none",
          width: "100%",
          height: "100%",
          border: "none",
          backgroundColor: "transparent",
        },
      })}
    </View>
  );
}

function PreviewNotice({
  title,
  file,
  url,
  quiet = false,
  icon = false,
}: {
  title: string;
  file: WorkspaceFile;
  url: string | null;
  quiet?: boolean;
  icon?: boolean;
}) {
  const type = fileTypeLabel(file.name, file.mimeType);
  const size = typeof file.size === "number" ? formatBytes(file.size) : "";
  return (
    <View style={styles.notice}>
      {icon ? <GeometricIcon name="file" size={28} color={colors.burgundy} /> : null}
      <Text style={quiet ? styles.loading : styles.noticeTitle}>{title}</Text>
      {quiet ? null : (
        <>
          <Text style={styles.noticeName} numberOfLines={2}>
            {file.name}
          </Text>
          <Text style={text.meta}>
            {type}
            {size ? ` · ${size}` : ""}
          </Text>
          {url ? <FileDownload url={url} name={file.name} /> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  nativeImage: {
    width: "100%",
    height: "100%",
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  textContent: {
    paddingHorizontal: 24,
    paddingVertical: 22,
  },
  loading: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  notice: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  noticeTitle: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    textAlign: "center",
  },
  noticeName: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
