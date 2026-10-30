import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ArrowUpIcon } from "@/components/ChatIcons";
import { CloseIcon } from "@/components/PreviewIcons";
import type { RoomMessage } from "@/domain/types";
import { ChatMessage } from "@/features/messages/ChatMessage";
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
  onReply: (body: string, inChannel: boolean) => void;
  onClose: () => void;
}) {
  const parent = messages.find((message) => message.id === parentId && !message.parentId);
  const replies = repliesTo(messages, parentId);
  const [draft, setDraft] = useState("");
  const [inChannel, setInChannel] = useState(false);
  const listRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const label = audience === "room" ? "Also send to channel" : "Also send to conversation";

  useEffect(() => {
    setDraft("");
    setInChannel(false);
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
    setInChannel(false);
  }

  if (!parent) {
    return null;
  }

  return (
    <View style={[styles.panel, overlay && styles.overlay]}>
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
            onReply={() => inputRef.current?.focus()}
          />
        ))}
      </ScrollView>
      <View style={styles.composer}>
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
        <View style={styles.field}>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
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
            style={[styles.input, Platform.OS === "web" ? { outlineWidth: 0 } : null]}
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
  field: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  input: {
    ...font.content,
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
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
