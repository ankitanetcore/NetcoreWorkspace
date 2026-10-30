import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { filesFromDrop } from "@/features/files/desktopFile";
import { colors, font } from "@/theme/tokens";

export function FileDropSurface({
  label,
  onFiles,
  children,
  style,
}: {
  label: string;
  onFiles: (files: File[]) => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const onFilesRef = useRef(onFiles);
  const depth = useRef(0);
  const detach = useRef<(() => void) | null>(null);
  const [over, setOver] = useState(false);
  onFilesRef.current = onFiles;

  useEffect(() => () => detach.current?.(), []);

  const attach = useCallback((node: View | null) => {
    detach.current?.();
    detach.current = null;
    if (Platform.OS !== "web" || !node) {
      return;
    }
    const element = node as unknown as HTMLElement;
    if (typeof HTMLElement === "undefined" || !(element instanceof HTMLElement)) {
      return;
    }
    element.dataset.fileDrop = "true";

    function accepts(event: DragEvent) {
      return Array.from(event.dataTransfer?.types ?? []).includes("Files");
    }

    function enter(event: DragEvent) {
      if (!accepts(event)) {
        return;
      }
      event.preventDefault();
      depth.current += 1;
      setOver(true);
    }

    function overTarget(event: DragEvent) {
      if (!accepts(event)) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    }

    function leave() {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) {
        setOver(false);
      }
    }

    function drop(event: DragEvent) {
      if (!accepts(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      depth.current = 0;
      setOver(false);
      void filesFromDrop(event).then((files) => {
        if (files.length > 0) {
          onFilesRef.current(files);
        }
      });
    }

    element.addEventListener("dragenter", enter);
    element.addEventListener("dragover", overTarget);
    element.addEventListener("dragleave", leave);
    element.addEventListener("drop", drop);
    detach.current = () => {
      element.removeEventListener("dragenter", enter);
      element.removeEventListener("dragover", overTarget);
      element.removeEventListener("dragleave", leave);
      element.removeEventListener("drop", drop);
    };
  }, []);

  return (
    <View ref={attach} style={[styles.surface, style]}>
      {children}
      {over ? (
        <View pointerEvents="none" style={styles.overlay}>
          <View style={styles.card}>
            <Text style={styles.label}>{label}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    flex: 1,
    minHeight: 0,
    position: "relative",
  },
  overlay: {
    position: "absolute",
    top: 8,
    right: 8,
    bottom: 8,
    left: 8,
    zIndex: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.burgundy,
    backgroundColor: "rgba(244, 230, 232, 0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    maxWidth: 360,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  label: {
    ...font.ui,
    color: colors.navy,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    textAlign: "center",
  },
});
