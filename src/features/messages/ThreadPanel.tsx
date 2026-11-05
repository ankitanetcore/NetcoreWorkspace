import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ArrowUpIcon } from "@/components/ChatIcons";
import { CloseIcon } from "@/components/PreviewIcons";
import type { RoomMessage } from "@/domain/types";
import { ChatMessage } from "@/features/messages/ChatMessage";
import { bindResizeGrip, composerCeiling } from "@/features/messages/composerField";
import { applyMark, shortcutMark } from "@/features/messages/markup";
import { repliesTo } from "@/features/messages/preview";
import { webPointer } from "@/theme/pressable";
import { colors, font, text } from "@/theme/tokens";

export function ThreadPanel({
  messages,
  parentId,
  audience,
  overlay,
  authorFor,
  mineFor,
  onReact,
  onEdit,
  onDelete,
  onReply,
  onClose,
}: {
  messages: RoomMessage[];
  parentId: string;
  audience: "room" | "direct";
  overlay: boolean;
  authorFor: (message: RoomMessage) => string;
  mineFor: (message: RoomMessage) => boolean;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (message: RoomMessage, body: string) => void;
  onDelete: (message: RoomMessage) => void;
  onReply: (body: string, inChannel: boolean) => void;
  onClose: () => void;
}) {
  const parent = messages.find((message) => message.id === parentId && !message.parentId);
  const replies = repliesTo(messages, parentId);
  const [draft, setDraft] = useState("");
  const [inChannel, setInChannel] = useState(false);
  const [inputHeight, setInputHeight] = useState<number | null>(null);
  const [ceiling, setCeiling] = useState(240);
  const listRef = useRef<ScrollView>(null);
  const panelRef = useRef<View>(null);
  const composerRef = useRef<View>(null);
  const gripRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);
  const programmedHeight = useRef(0);
  const ceilingRef = useRef(ceiling);
  const caretRef = useRef<{ start: number; end: number } | null>(null);
  ceilingRef.current = ceiling;

  function fitInput() {
    const node = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!node || Platform.OS !== "web" || node.dataset.manual === "1") {
      return;
    }
    if (programmedHeight.current > 0 && Math.abs(node.offsetHeight - programmedHeight.current) > 4) {
      node.dataset.manual = "1";
      const next = Math.max(40, Math.min(ceilingRef.current, node.offsetHeight));
      programmedHeight.current = next;
      setInputHeight(next);
      return;
    }
    const previous = node.style.height;
    node.style.height = "auto";
    const next = Math.max(40, Math.min(ceilingRef.current, node.scrollHeight));
    node.style.height = previous;
    programmedHeight.current = next;
    setInputHeight(next);
  }

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }
    const node = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!node) {
      return;
    }
    (panelRef.current as unknown as HTMLElement | null)?.setAttribute("data-thread-panel", "true");
    (composerRef.current as unknown as HTMLElement | null)?.setAttribute("data-composer-root", "true");
    node.dataset.format = "markup";
    node.dataset.resize = "true";
    node.title = "Drag the bar above to resize. Ctrl or Cmd + B bold, I italic, U underline, E code.";
    const grip = gripRef.current as unknown as HTMLElement | null;
    const unbindGrip = grip
      ? bindResizeGrip(grip, node, {
          minimum: 40,
          ceiling: ceilingRef,
          onHeight: (next) => {
            node.dataset.manual = "1";
            programmedHeight.current = next;
            setInputHeight(next);
          },
        })
      : null;
    programmedHeight.current = node.offsetHeight;
    const measure = () => {
      const cap = composerCeiling(node, 40);
      ceilingRef.current = cap;
      setCeiling((current) => (Math.abs(current - cap) <= 1 ? current : cap));
    };
    const onPointerUp = () => {
      if (Math.abs(node.offsetHeight - programmedHeight.current) > 4) {
        node.dataset.manual = "1";
        const next = Math.max(40, Math.min(ceilingRef.current, node.offsetHeight));
        programmedHeight.current = next;
        setInputHeight(next);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      const mark = shortcutMark(event);
      if (!mark) {
        return;
      }
      event.preventDefault();
      const start = node.selectionStart ?? 0;
      const end = node.selectionEnd ?? start;
      const next = applyMark(node.value, start, end, mark);
      caretRef.current = { start: next.start, end: next.end };
      setDraft(next.value);
      requestAnimationFrame(() => fitInput());
    };
    measure();
    const pane = panelRef.current as unknown as HTMLElement | null;
    const observer = pane && typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (pane) {
      observer?.observe(pane);
    }
    node.addEventListener("keydown", onKey);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      unbindGrip?.();
      node.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("resize", measure);
    };
  }, []);

  useLayoutEffect(() => {
    const pending = caretRef.current;
    const node = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!pending || !node || Platform.OS !== "web") {
      return;
    }
    caretRef.current = null;
    node.setSelectionRange(pending.start, pending.end);
  }, [draft]);
  const label = audience === "room" ? "Also send to channel" : "Also send to conversation";

  useEffect(() => {
    setDraft("");
    setInChannel(false);
    setInputHeight(null);
    programmedHeight.current = 0;
    const node = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (node) {
      delete node.dataset.manual;
    }
  }, [parentId]);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: false });
  }, [replies.length]);

  function send() {
    const body = draft.trim();
    if (!body || !parent) {
      return;
    }
    onReply(body, inChannel);
    setDraft("");
    setInputHeight(null);
    programmedHeight.current = 0;
    const node = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (node) {
      delete node.dataset.manual;
    }
    setInChannel(false);
  }

  if (!parent) {
    return null;
  }

  return (
    <View ref={panelRef} style={[styles.panel, overlay && styles.overlay]}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[text.title, styles.heading]}>
          Thread
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close thread"
          onPress={onClose}
          style={({ pressed, hovered }) => [styles.close, webPointer, (pressed || hovered) && styles.closeOn]}
        >
          <CloseIcon size={16} color={colors.navy} />
        </Pressable>
      </View>
      <ScrollView ref={listRef} contentContainerStyle={styles.list}>
        <ChatMessage
          message={parent}
          author={authorFor(parent)}
          mine={mineFor(parent)}
          grouped={false}
          replyCount={0}
          linked={false}
          onReact={(emoji) => onReact(parent.id, emoji)}
          onEdit={(body) => onEdit(parent, body)}
          onDelete={() => onDelete(parent)}
          onReply={() => inputRef.current?.focus()}
        />
        {replies.length > 0 ? <Text style={styles.section}>{replies.length === 1 ? "1 reply" : `${replies.length} replies`}</Text> : null}
        {replies.map((message, index) => (
          <ChatMessage
            key={message.id}
            message={message}
            author={authorFor(message)}
            mine={mineFor(message)}
            grouped={replies[index - 1]?.authorId === message.authorId}
            replyCount={0}
            linked={false}
            onReact={(emoji) => onReact(message.id, emoji)}
            onEdit={(body) => onEdit(message, body)}
            onDelete={() => onDelete(message)}
            onReply={() => inputRef.current?.focus()}
          />
        ))}
      </ScrollView>
      <View ref={composerRef} style={styles.composer}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: inChannel }}
          accessibilityLabel={label}
          onPress={() => setInChannel((value) => !value)}
          style={({ pressed }) => [styles.checkRow, webPointer, pressed && styles.pressed]}
        >
          <View style={[styles.box, inChannel && styles.boxOn]}>
            {inChannel ? <View style={styles.tick} /> : null}
          </View>
          <Text style={styles.checkLabel}>{label}</Text>
        </Pressable>
        <View
          ref={gripRef}
          accessibilityRole="adjustable"
          accessibilityLabel="Drag to resize the reply box"
          style={[styles.grip, Platform.OS === "web" ? ({ cursor: "ns-resize" } as object) : null]}
        >
          <View style={styles.gripBar} />
        </View>
        <View style={styles.field}>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={(value) => {
              setDraft(value);
              const node = inputRef.current as unknown as HTMLTextAreaElement | null;
              if (!value && node) {
                delete node.dataset.manual;
                programmedHeight.current = 0;
                setInputHeight(null);
                return;
              }
              requestAnimationFrame(() => fitInput());
            }}
            placeholder="Reply in thread"
            placeholderTextColor={colors.faint}
            accessibilityLabel="Reply in thread"
            multiline
            onKeyPress={(event) => {
              if (event.nativeEvent.key === "Enter" && !(event.nativeEvent as { shiftKey?: boolean }).shiftKey) {
                event.preventDefault?.();
                send();
              }
            }}
            style={[
              styles.input,
              { maxHeight: ceiling },
              inputHeight ? { height: inputHeight } : null,
              Platform.OS === "web" ? ({ resize: "vertical", overflowY: "auto", outlineWidth: 0 } as object) : null,
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send reply"
            disabled={!draft.trim()}
            onPress={send}
            style={({ pressed }) => [styles.send, !draft.trim() && styles.sendOff, webPointer, pressed && styles.pressed]}
          >
            <ArrowUpIcon size={16} color={colors.youText} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: 380,
    maxWidth: "46%",
    minWidth: 300,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
    backgroundColor: colors.background,
  },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: "auto",
    maxWidth: "100%",
    minWidth: 0,
    zIndex: 8,
  },
  header: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  heading: {
    fontSize: 18,
    lineHeight: 24,
  },
  close: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  closeOn: {
    backgroundColor: colors.canvas,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 14,
  },
  section: {
    ...font.ui,
    color: colors.faint,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    marginTop: 4,
  },
  composer: {
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    minHeight: 28,
    paddingHorizontal: 4,
  },
  box: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: {
    borderColor: colors.navy,
    backgroundColor: colors.navy,
  },
  tick: {
    width: 8,
    height: 4,
    borderLeftWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: colors.youText,
    transform: [{ rotate: "-45deg" }, { translateY: -1 }],
  },
  checkLabel: {
    ...font.content,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  grip: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    height: 16,
  },
  gripBar: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.muted,
  },
  field: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  input: {
    ...font.content,
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.ink,
    backgroundColor: colors.background,
    fontSize: 15,
    lineHeight: 22,
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  sendOff: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.72,
  },
});
