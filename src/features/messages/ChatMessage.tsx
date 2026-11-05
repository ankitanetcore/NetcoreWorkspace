import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Linking, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, type GestureResponderEvent, type ViewStyle } from "react-native";

import { CheckIcon, MessageSquareIcon, PencilIcon, SmileIcon, TrashIcon } from "@/components/ChatIcons";
import { CloseIcon } from "@/components/PreviewIcons";
import type { RoomMessage } from "@/domain/types";
import { SharedFileCard } from "@/features/files/SharedFileCard";
import { columnTextStyle } from "@/features/messages/columnText";
import { applyMark, MessageBody, shortcutMark } from "@/features/messages/markup";
import { EmojiPicker } from "@/features/messages/EmojiPicker";
import { quickReactions, reactionList } from "@/features/messages/messageModel";
import { mountPopup } from "@/features/messages/portal";
import { useSession } from "@/session/Session";
import { webPointer } from "@/theme/pressable";
import { colors, font } from "@/theme/tokens";

function openMessageLink(event: GestureResponderEvent, href: string) {
  event.stopPropagation?.();
  if (Platform.OS === "web") {
    window.open(href, "_blank", "noopener,noreferrer");
    return;
  }
  void Linking.openURL(href);
}

function chatBounds(anchor: HTMLElement) {
  let left = 8;
  let right = window.innerWidth - 8;
  let node: HTMLElement | null = anchor.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (style.overflowY === "auto" || style.overflowY === "scroll") {
      const rect = node.getBoundingClientRect();
      if (rect.width > 160) {
        left = Math.max(8, rect.left + 12);
        right = Math.min(window.innerWidth - 8, rect.right - 12);
        break;
      }
    }
    node = node.parentElement;
  }
  return { left, right };
}

export function ChatMessage({
  message,
  author,
  mine,
  grouped,
  replyCount,
  linked,
  onReact,
  onEdit,
  onDelete,
  onReply,
}: {
  message: RoomMessage;
  author: string;
  mine: boolean;
  grouped: boolean;
  replyCount: number;
  linked: boolean;
  onReact: (emoji: string) => void;
  onEdit: (body: string) => void;
  onDelete: () => void;
  onReply: () => void;
}) {
  const { clientId } = useSession();
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [focused, setFocused] = useState(false);
  const [picker, setPicker] = useState<"quick" | "all" | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [side, setSide] = useState<"left" | "right">(mine ? "left" : "right");
  const [popupBox, setPopupBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [draft, setDraft] = useState(message.body);
  const reactAnchor = useRef<View>(null);
  const popupRef = useRef<View>(null);
  const rootRef = useRef<View>(null);
  const bodyRef = useRef<View>(null);
  const [editSize, setEditSize] = useState<{ width: number; height: number } | null>(null);
  const stackRef = useRef<View>(null);
  const editRef = useRef<TextInput>(null);
  const caretRef = useRef<{ start: number; end: number } | null>(null);
  const canEdit = mine && Boolean(message.body.trim());
  const canDelete = mine && Boolean(message.body.trim() || message.file);
  const shown = hovered || pinned || focused || picker !== null || editing;
  const attachmentOnly = Boolean(message.file) && !message.body?.trim();
  const reactions = reactionList(message.reactions);

  useEffect(() => {
    if (!editing) {
      setDraft(message.body);
    }
  }, [editing, message.body]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }
    const root = rootRef.current as unknown as HTMLElement | null;
    if (!root) {
      return;
    }
    const enter = () => setHovered(true);
    const leave = () => setHovered(false);
    root.addEventListener("pointerenter", enter);
    root.addEventListener("pointerleave", leave);
    return () => {
      root.removeEventListener("pointerenter", enter);
      root.removeEventListener("pointerleave", leave);
    };
  }, []);

  useEffect(() => {
    if (!shown || Platform.OS !== "web" || typeof document === "undefined") {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      if (editing) {
        setEditing(false);
        setDraft(message.body);
      }
      setPicker(null);
      setPinned(false);
    }
    function onPointer(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      const root = rootRef.current as unknown as HTMLElement | null;
      const popup = popupRef.current as unknown as HTMLElement | null;
      if (root?.contains(target) || popup?.contains(target)) {
        return;
      }
      setPicker(null);
      setPinned(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [editing, message.body, shown]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }
    const stack = stackRef.current as unknown as HTMLElement | null;
    if (!stack?.getBoundingClientRect) {
      return;
    }
    const place = () => {
      const rect = stack.getBoundingClientRect();
      const needed = canDelete ? 184 : 76;
      setSide(window.innerWidth - rect.right < needed + 20 ? "left" : "right");
    };
    place();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    observer?.observe(document.documentElement);
    window.addEventListener("resize", place);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [canDelete]);

  function releaseFocus() {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      setFocused(false);
      return;
    }
    setTimeout(() => {
      const root = rootRef.current as unknown as HTMLElement | null;
      const active = document.activeElement;
      if (root && active && root.contains(active)) {
        return;
      }
      setFocused(false);
    }, 0);
  }

  useEffect(() => {
    if (!picker || Platform.OS !== "web") {
      setPopupBox(null);
      return;
    }
    const anchor = reactAnchor.current as unknown as HTMLElement | null;
    if (!anchor?.getBoundingClientRect) {
      return;
    }
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const width = picker === "all" ? 320 : 248;
      const height = picker === "all" ? 350 : 40;
      const bounds = chatBounds(anchor);
      let left = side === "right" ? rect.right - width : rect.left;
      left = Math.max(bounds.left, Math.min(left, bounds.right - width));
      const below = rect.bottom + 6;
      const above = rect.top - height - 6;
      let top = picker === "quick" ? below : above;
      if (top < 8 || top + height > window.innerHeight - 8) {
        top = picker === "quick" ? Math.max(8, above) : Math.max(8, Math.min(below, window.innerHeight - height - 8));
      }
      setPopupBox({ top, left, width, height });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [picker, side]);

  function startEdit() {
    const node = bodyRef.current as unknown as HTMLElement | null;
    const rect = node?.getBoundingClientRect?.();
    setEditSize(rect && rect.height > 0 ? { width: Math.ceil(rect.width), height: Math.ceil(rect.height) } : null);
    setPicker(null);
    setDraft(message.body);
    setEditing(true);
  }

  function askDelete() {
    setPicker(null);
    setConfirming(true);
  }

  function confirmDelete() {
    setConfirming(false);
    setEditing(false);
    onDelete();
  }

  function save() {
    const next = draft.trim();
    if (next === message.body.trim()) {
      setEditing(false);
      return;
    }
    if (!next) {
      askDelete();
      return;
    }
    onEdit(next);
    setEditing(false);
  }

  useEffect(() => {
    if (!editing || Platform.OS !== "web") {
      return;
    }
    const node = editRef.current as unknown as HTMLTextAreaElement | null;
    if (!node) {
      return;
    }
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
    };
    node.dataset.format = "markup";
    node.title = "Ctrl or Cmd + B bold, I italic, U underline, E code.";
    node.addEventListener("keydown", onKey);
    return () => node.removeEventListener("keydown", onKey);
  }, [editing]);

  useLayoutEffect(() => {
    const pending = caretRef.current;
    const node = editRef.current as unknown as HTMLTextAreaElement | null;
    if (!editing || !pending || !node || Platform.OS !== "web") {
      return;
    }
    caretRef.current = null;
    node.setSelectionRange(pending.start, pending.end);
  }, [draft, editing]);

  const reactionChoices = (
    <View style={[styles.quick, Platform.OS === "web" ? null : [styles.quickFlow, side === "right" ? styles.popupEnd : styles.popupStart]]}>
      {quickReactions.map((emoji) => (
        <Pressable
          key={emoji}
          accessibilityRole="button"
          accessibilityLabel={`React with ${emoji}`}
          onPress={() => {
            onReact(emoji);
            setPicker(null);
          }}
          style={({ pressed, hovered: over }) => [styles.quickEmoji, over && styles.toolOnButton, webPointer, pressed && styles.pressed]}
        >
          <Text style={styles.quickGlyph}>{emoji}</Text>
        </Pressable>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="More emoji"
        onPress={() => setPicker("all")}
        style={({ pressed, hovered: over }) => [styles.quickEmoji, over && styles.toolOnButton, webPointer, pressed && styles.pressed]}
      >
        <Text style={styles.moreGlyph}>+</Text>
      </Pressable>
    </View>
  );

  const fullPicker = (
    <EmojiPicker
      anchorRef={reactAnchor}
      align={side === "right" ? "end" : "start"}
      docked={Platform.OS === "web"}
      onClose={() => setPicker(null)}
      onSelect={(emoji) => {
        onReact(emoji);
        setPicker(null);
      }}
    />
  );

  const floating =
    Platform.OS === "web" && picker && popupBox
      ? mountPopup(
          <View
            ref={popupRef}
            style={
              {
                position: "fixed",
                top: popupBox.top,
                left: popupBox.left,
                width: popupBox.width,
                height: picker === "all" ? popupBox.height : undefined,
                zIndex: 80,
              } as ViewStyle
            }
          >
            {picker === "quick" ? reactionChoices : fullPicker}
          </View>,
        )
      : null;

  return (
    <>
    <Pressable
      ref={rootRef}
      onFocus={() => setFocused(true)}
      onBlur={releaseFocus}
      delayLongPress={350}
      onLongPress={() => setPinned((value) => !value)}
      style={[
        styles.message,
        mine && styles.messageMine,
        grouped && styles.messageGrouped,
        picker !== null && styles.messageRaised,
        Platform.OS === "web" ? ({ cursor: "default" } as unknown as ViewStyle) : null,
      ]}
    >
      {grouped ? null : (
        <View style={styles.meta}>
          <Text style={styles.author}>{author}</Text>
          {message.editedAt && !grouped ? <EditedMark time={message.time} /> : null}
        </View>
      )}
      <View ref={stackRef} style={styles.stack}>
        <View
          pointerEvents={shown ? "auto" : "none"}
          style={[styles.toolbarWrap, side === "left" ? styles.toolbarLeft : styles.toolbarRight, shown ? styles.toolbarOn : styles.toolbarOff]}
          accessibilityElementsHidden={!shown}
        >
          <View style={styles.toolbar}>
            <View ref={reactAnchor} style={styles.anchor}>
              <ToolButton
                label={`Add reaction to ${author}'s message`}
                onPress={() => setPicker((value) => (value === "quick" ? null : "quick"))}
                onFocus={() => setFocused(true)}
                onBlur={releaseFocus}
              >
                <SmileIcon size={16} color={colors.ink} />
              </ToolButton>
              {Platform.OS !== "web" && picker === "quick" ? reactionChoices : null}
              {Platform.OS !== "web" && picker === "all" ? fullPicker : null}
            </View>
            <ToolButton label={`Reply in thread to ${author}`} onPress={onReply} onFocus={() => setFocused(true)} onBlur={releaseFocus}>
              <MessageSquareIcon size={16} color={colors.ink} />
            </ToolButton>
            {canEdit ? (
              <ToolButton
                label={`Edit ${author}'s message`}
                onPress={() => {
                  if (!editing) {
                    startEdit();
                  }
                }}
                onFocus={() => setFocused(true)}
                onBlur={releaseFocus}
              >
                <PencilIcon size={16} color={colors.ink} />
              </ToolButton>
            ) : null}
            {canDelete ? (
              <ToolButton
                label={`Delete ${author}'s message`}
                onPress={askDelete}
                onFocus={() => setFocused(true)}
                onBlur={releaseFocus}
              >
                <TrashIcon size={16} color={colors.ink} />
              </ToolButton>
            ) : null}
          </View>
        </View>
        <Pressable
          delayLongPress={350}
          onLongPress={() => setPinned((value) => !value)}
          style={[styles.press, mine && styles.pressMine]}
        >
          {editing ? (
            <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther, styles.editor]}>
              <TextInput
                ref={editRef}
                value={draft}
                onChangeText={setDraft}
                multiline
                autoFocus
                accessibilityLabel="Edit message"
                style={[styles.editorInput, editSize ? { width: editSize.width, minHeight: editSize.height } : null]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel edit"
                onPress={() => {
                  setEditing(false);
                  setDraft(message.body);
                }}
                style={({ pressed, hovered }) => [styles.editorIcon, hovered && styles.toolOnButton, webPointer, pressed && styles.pressed]}
              >
                <CloseIcon size={15} color={colors.muted} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={!draft.trim() ? "Delete message" : draft.trim() === message.body.trim() ? "Close edit" : "Save edit"}
                onPress={save}
                style={({ pressed, hovered }) => [styles.editorIcon, hovered && styles.toolOnButton, webPointer, pressed && styles.pressed]}
              >
                <CheckIcon size={16} color={colors.navy} />
              </Pressable>
            </View>
          ) : message.body?.trim() ? (
            <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
              <View ref={bodyRef}>
                <MessageBody
                  body={message.body}
                  onLink={openMessageLink}
                  baseStyle={{ ...styles.body, ...columnTextStyle(message.body) }}
                  linkStyle={styles.link}
                />
              </View>
            </View>
          ) : null}
        </Pressable>
        {grouped && message.editedAt ? <EditedMark time={message.time} /> : null}
        {message.file ? <SharedFileCard file={message.file} solo={attachmentOnly} suggest={mine} /> : null}
        {reactions.length > 0 ? (
          <View style={[styles.pills, mine && styles.pillsMine]}>
            {reactions.map((reaction) => {
              const reacted = Boolean(clientId) && reaction.authorIds.includes(clientId);
              return (
                <Pressable
                  key={reaction.emoji}
                  accessibilityRole="button"
                  accessibilityLabel={`${reaction.emoji}, ${reaction.authorIds.length}${reacted ? ", yours" : ""}`}
                  accessibilityState={{ selected: reacted }}
                  onPress={() => onReact(reaction.emoji)}
                  style={({ pressed, hovered: over }) => [styles.pill, reacted && styles.pillMine, over && styles.pillHover, webPointer, pressed && styles.pressed]}
                >
                  <Text style={styles.pillEmoji}>{reaction.emoji}</Text>
                  <Text style={[styles.pillCount, reacted && styles.pillCountMine]}>{reaction.authorIds.length}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {replyCount > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${replyCount} ${replyCount === 1 ? "reply" : "replies"}`} onPress={onReply} style={webPointer}>
            <Text style={styles.replies}>{replyCount === 1 ? "1 reply" : `${replyCount} replies`}</Text>
          </Pressable>
        ) : null}
        {linked ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Open thread" onPress={onReply} style={[webPointer, mine && styles.linkedMine]}>
            <Text style={[styles.replies, mine && styles.repliesMine]}>In thread</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
    {floating}
    {confirming ? (
      <Modal visible transparent animationType="fade" onRequestClose={() => setConfirming(false)}>
        <View style={styles.scrim}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel delete" style={styles.scrimDismiss} onPress={() => setConfirming(false)} />
          <View style={styles.confirm}>
            <Text accessibilityRole="header" style={styles.confirmTitle}>
              Delete this message?
            </Text>
            <Text style={styles.confirmBody}>This removes it for everyone in the conversation. You can’t undo it.</Text>
            <View style={styles.confirmActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={() => setConfirming(false)}
                style={({ pressed }) => [styles.confirmCancel, webPointer, pressed && styles.pressed]}
              >
                <Text style={styles.confirmCancelLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete message"
                onPress={confirmDelete}
                style={({ pressed }) => [styles.confirmDelete, webPointer, pressed && styles.pressed]}
              >
                <Text style={styles.confirmDeleteLabel}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    ) : null}
    </>
  );
}

function EditedMark({ time }: { time: string }) {
  return <Text style={styles.edited}>{time ? `${time} (edited)` : "(edited)"}</Text>;
}

function ToolButton({
  label,
  onPress,
  onFocus,
  onBlur,
  children,
}: {
  label: string;
  onPress: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      style={({ pressed, hovered }) => [styles.tool, hovered && styles.toolOnButton, webPointer, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const shadow = Platform.OS === "web" ? ({ boxShadow: "0 8px 20px rgba(20, 32, 51, 0.08)" } as object) : {
  shadowColor: "#142033",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 12,
  elevation: 3,
};

const toolbarShadow = Platform.OS === "web" ? ({ boxShadow: "0 1px 2px rgba(20, 32, 51, 0.05)" } as object) : {
  shadowColor: "#142033",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 2,
  elevation: 1,
};

const styles = StyleSheet.create({
  message: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
    maxWidth: 460,
    gap: 2,
  },
  messageRaised: {
    zIndex: 30,
  },
  messageMine: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  messageGrouped: {
    marginTop: -13,
  },
  meta: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  author: {
    ...font.ui,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: colors.muted,
  },
  edited: {
    ...font.content,
    color: colors.faint,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },
  stack: {
    alignSelf: "stretch",
    position: "relative",
    gap: 6,
  },
  toolbarWrap: {
    position: "absolute",
    top: 0,
    zIndex: 6,
    ...(Platform.OS === "web" ? ({ transition: "opacity 140ms ease" } as object) : null),
  },
  toolbarRight: {
    left: "100%",
    paddingLeft: 8,
  },
  toolbarLeft: {
    right: "100%",
    paddingRight: 8,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(20, 32, 51, 0.08)",
    backgroundColor: "rgba(255, 252, 248, 0.96)",
    ...toolbarShadow,
  },
  toolbarOn: {
    opacity: 1,
  },
  toolbarOff: {
    opacity: 0,
  },
  tool: {
    width: 30,
    height: 30,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  toolOnButton: {
    backgroundColor: "rgba(20, 32, 51, 0.05)",
  },
  anchor: {
    position: "relative",
  },
  quick: {
    zIndex: 40,
    width: 248,
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 2,
    padding: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(20, 32, 51, 0.08)",
    backgroundColor: colors.surface,
    ...shadow,
  },
  quickFlow: {
    position: "absolute",
    top: "100%",
    marginTop: 6,
  },
  popupStart: {
    left: 0,
  },
  popupEnd: {
    right: 0,
  },
  quickEmoji: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  quickGlyph: {
    fontSize: 18,
    lineHeight: 22,
  },
  moreGlyph: {
    ...font.ui,
    color: colors.navy,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "500",
  },
  press: {
    alignSelf: "flex-start",
  },
  pressMine: {
    alignSelf: "flex-end",
  },
  bubble: {
    alignSelf: "flex-start",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "transparent",
    borderWidth: 1,
  },
  bubbleOther: {
    borderColor: colors.line,
  },
  bubbleMine: {
    borderColor: "rgba(122, 48, 64, 0.32)",
  },
  body: {
    ...font.content,
    color: colors.navy,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
    textAlign: "left",
  },
  link: {
    color: colors.burgundy,
    textDecorationLine: "underline",
  },
  editor: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingRight: 2,
    backgroundColor: "transparent",
  },
  editorInput: {
    ...font.content,
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 8,
    maxWidth: 380,
    color: colors.navy,
    fontSize: 15,
    lineHeight: 22,
    padding: 0,
    margin: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    ...(Platform.OS === "web"
      ? ({ outlineStyle: "none", outlineWidth: 0, boxShadow: "none" } as object)
      : null),
  },
  editorIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  editorOff: {
    opacity: 0.35,
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignSelf: "flex-start",
    gap: 6,
    maxWidth: "100%",
  },
  pillsMine: {
    alignSelf: "flex-end",
    justifyContent: "flex-end",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 26,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  pillMine: {
    backgroundColor: colors.burgundySoft,
    borderColor: "rgba(122, 48, 64, 0.28)",
  },
  pillHover: {
    borderColor: "rgba(122, 48, 64, 0.35)",
  },
  pillEmoji: {
    fontSize: 14,
    lineHeight: 18,
  },
  pillCount: {
    ...font.ui,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  pillCountMine: {
    color: colors.burgundy,
  },
  linkedMine: {
    alignSelf: "flex-end",
  },
  replies: {
    ...font.ui,
    color: colors.burgundy,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  repliesMine: {
    textAlign: "right",
  },
  pressed: {
    opacity: 0.72,
  },
  scrim: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(20, 32, 51, 0.28)",
  },
  scrimDismiss: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  confirm: {
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
  confirmTitle: {
    ...font.brand,
    color: colors.navy,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
  },
  confirmBody: {
    ...font.content,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
  },
  confirmActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  confirmCancel: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmCancelLabel: {
    ...font.ui,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  confirmDelete: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.burgundy,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmDeleteLabel: {
    ...font.ui,
    color: colors.youText,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
});
