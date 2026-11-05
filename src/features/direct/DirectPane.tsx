import * as DocumentPicker from "expo-document-picker";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

import { BackButton } from "@/components/BackButton";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { ArrowUpIcon, PaperclipIcon, SmileIcon } from "@/components/ChatIcons";
import type { FileAudience, RoomMessage, SharedFileRef } from "@/domain/types";
import { sendDirectMessage, threadForPeer } from "@/features/direct/direct";
import { assetFromFile } from "@/features/files/desktopFile";
import { FileDropSurface } from "@/features/files/FileDropSurface";
import { transferChatFile } from "@/features/files/transferBytes";
import { subscribeTransferNotice } from "@/features/files/transferNotice";
import { EmojiPicker } from "@/features/messages/EmojiPicker";
import { DayDivider } from "@/features/messages/DayDivider";
import { ChatMessage } from "@/features/messages/ChatMessage";
import { editInDirect, reactInDirect, removeInDirect, replyInDirect } from "@/features/messages/messageActions";
import { bindResizeGrip, composerCeiling } from "@/features/messages/composerField";
import { applyMark, shortcutMark } from "@/features/messages/markup";
import { channelMessages, continuesSender, repliesTo } from "@/features/messages/preview";
import { sentDay } from "@/features/messages/sentWhen";
import { ThreadPanel } from "@/features/messages/ThreadPanel";
import { markRead } from "@/features/messages/readState";
import { useKnownPeers } from "@/features/rooms/RoomDialogs";
import { displayNameFor } from "@/session/displayName";
import { useSession } from "@/session/Session";
import { webPointer } from "@/theme/pressable";
import { colors, font, layout, text } from "@/theme/tokens";
import { getTransport } from "@/transport";

export function DirectPane({ peerId, onBack }: { peerId: string; onBack?: () => void }) {
  const { name, clientId } = useSession();
  const peers = useKnownPeers();
  const [, setTick] = useState(0);
  const peer = peers.find((item) => item.clientId === peerId);
  const label = peer?.displayName || peerId.slice(0, 8);
  const online = peer?.status === "online";
  const thread = threadForPeer(peerId);
  const messages = thread?.messages ?? [];
  const listRef = useRef<ScrollView>(null);
  const stickToEnd = useRef(true);
  const [dropped, setDropped] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [droppedExtra, setDroppedExtra] = useState(0);
  const [threadId, setThreadId] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const timeline = channelMessages(messages);
  const threadRoot = messages.find((message) => message.id === threadId && !message.parentId);

  useEffect(() => {
    setThreadId(null);
    setDropped(null);
    setDroppedExtra(0);
  }, [peerId]);

  useEffect(() => {
    return getTransport().subscribe("direct", () => {
      setTick((value) => value + 1);
    });
  }, []);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (thread && last) {
      markRead(thread.id, last.id);
    }
  }, [thread, messages]);

  function send(outgoing: OutgoingMessage) {
    const message: RoomMessage = {
      id: outgoing.id,
      author: name,
      authorId: clientId,
      time: new Date(outgoing.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      sentAt: outgoing.sentAt,
      body: outgoing.body,
      file: outgoing.file,
    };
    sendDirectMessage(peerId, message);
  }

  return (
    <View style={styles.thread}>
      <View style={styles.header}>
        {onBack ? <BackButton onPress={onBack} /> : null}
        <ProfileAvatar name={label} photoUri={peer?.photoUri} size={36} backgroundColor={colors.burgundySoft} color={colors.burgundy} />
        <View style={styles.title}>
          <Text accessibilityRole="header" style={[text.title, font.brand, styles.brandTitle]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[text.meta, font.content]}>{online ? "Connected" : "Not connected"}</Text>
        </View>
      </View>
      <View style={styles.conversation}>
      <FileDropSurface
        label={`Drop a file to attach it for ${label}. You still press Send.`}
        onFiles={(files) => {
          const [first, ...rest] = files;
          if (!first) {
            return;
          }
          setDropped(assetFromFile(first));
          setDroppedExtra(rest.length);
        }}
      >
      {timeline.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[text.meta, font.content]}>No messages yet</Text>
          <Text style={styles.note}>Only you and {label} can see this conversation.</Text>
        </View>
      ) : (
        <ScrollView
          ref={listRef}
          contentContainerStyle={styles.messages}
          scrollEventThrottle={16}
          onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
            const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
            stickToEnd.current = contentSize.height - layoutMeasurement.height - contentOffset.y < 48;
          }}
          onContentSizeChange={() => {
            if (stickToEnd.current) {
              listRef.current?.scrollToEnd({ animated: false });
            }
          }}
        >
          {timeline.map((message, index) => {
            const day = sentDay(message.sentAt);
            const previous = timeline[index - 1];
            const previousDay = sentDay(previous?.sentAt);
            return (
              <View key={message.id} style={styles.messageBlock}>
                {day && day !== previousDay ? <DayDivider label={day} /> : null}
                <ChatMessage
                  message={message}
                  mine={message.authorId === clientId}
                  grouped={continuesSender(previous, message)}
                  author={displayNameFor(peers, message.authorId, message.author, { clientId, name })}
                  replyCount={message.parentId ? 0 : repliesTo(messages, message.id).length}
                  linked={Boolean(message.parentId)}
                  onReact={(emoji) => reactInDirect(peerId, message.id, emoji)}
                  onEdit={(body) => editInDirect(peerId, message, body)}
                  onDelete={() => removeInDirect(peerId, message)}
                  onReply={() => setThreadId(message.parentId || message.id)}
                />
              </View>
            );
          })}
        </ScrollView>
      )}
      <Composer
        conversationName={label}
        audience={{ kind: "direct", participantIds: [clientId, peerId].filter(Boolean) }}
        onSend={send}
        dropped={dropped}
        droppedExtra={droppedExtra}
        onDropped={() => {
          setDropped(null);
          setDroppedExtra(0);
        }}
      />
      </FileDropSurface>
      {threadRoot ? (
        <ThreadPanel
          messages={messages}
          parentId={threadRoot.id}
          audience="direct"
          overlay={width < layout.desktopMinWidth}
          authorFor={(message) => displayNameFor(peers, message.authorId, message.author, { clientId, name })}
          mineFor={(message) => message.authorId === clientId}
          onReact={(messageId, emoji) => reactInDirect(peerId, messageId, emoji)}
          onEdit={(message, body) => editInDirect(peerId, message, body)}
          onDelete={(message) => removeInDirect(peerId, message)}
          onReply={(body, inChannel) => replyInDirect(peerId, threadRoot.id, body, name, inChannel)}
          onClose={() => setThreadId(null)}
        />
      ) : null}
      </View>
    </View>
  );
}

export type OutgoingMessage = {
  id: string;
  sentAt: string;
  body: string;
  file?: SharedFileRef;
};

function outgoingId(kind: "file" | "text") {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const inputLineHeight = 22;
const inputPad = 9;
const singleLineHeight = inputLineHeight + inputPad * 2;

function useComposerFrame(fieldRef: { current: View | null }) {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      return;
    }
    const node = fieldRef.current as unknown as HTMLElement | null;
    node?.setAttribute("data-composer", "field");
    node?.parentElement?.parentElement?.parentElement?.setAttribute("data-composer-root", "true");
    let style = document.getElementById("netcore-composer");
    if (!style) {
      style = document.createElement("style");
      style.id = "netcore-composer";
      document.head.appendChild(style);
    }
    style.textContent = `
      [data-composer="field"]:focus-within {
        border-color: rgba(122, 48, 64, 0.4);
      }
      [data-composer="field"] textarea {
        outline: none;
        border: none;
        box-shadow: none;
        background: transparent;
        resize: vertical !important;
        overflow-y: auto !important;
      }
      textarea[data-resize="true"] {
        resize: vertical !important;
        overflow-y: auto !important;
      }
      [data-composer-grip="true"] {
        cursor: ns-resize;
        touch-action: none;
      }
      [data-composer-grip="true"]:hover [data-grip-bar="true"] {
        background: #142033;
      }
      [data-composer="field"] textarea:focus,
      [data-composer="field"] textarea:focus-visible {
        outline: none;
        border: none;
        box-shadow: none;
      }
    `;
  }, []);
}

export function Composer({
  conversationName,
  audience,
  onSend,
  dropped = null,
  droppedExtra = 0,
  onDropped,
}: {
  conversationName: string;
  audience: FileAudience;
  onSend: (message: OutgoingMessage) => void;
  dropped?: DocumentPicker.DocumentPickerAsset | null;
  droppedExtra?: number;
  onDropped?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [inputHeight, setInputHeight] = useState(singleLineHeight);
  const [ceiling, setCeiling] = useState(singleLineHeight * 8);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const fieldRef = useRef<View>(null);
  const gripRef = useRef<View>(null);
  const emojiButtonRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);
  const programmedHeight = useRef(singleLineHeight);
  const ceilingRef = useRef(ceiling);
  const caretRef = useRef<{ start: number; end: number } | null>(null);
  ceilingRef.current = ceiling;
  useComposerFrame(fieldRef);

  function insertEmoji(emoji: string) {
    const node = inputRef.current as unknown as HTMLTextAreaElement | null;
    const start = typeof node?.selectionStart === "number" ? node.selectionStart : draft.length;
    const end = typeof node?.selectionEnd === "number" ? node.selectionEnd : draft.length;
    const next = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    const cursor = start + emoji.length;
    caretRef.current = { start: cursor, end: cursor };
    setDraft(next);
    requestAnimationFrame(() => resizeInput());
  }

  function resizeInput(contentHeight?: number) {
    const cap = ceilingRef.current;
    const node = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!node || Platform.OS !== "web") {
      if (typeof contentHeight === "number") {
        const next = Math.max(singleLineHeight, Math.min(cap, contentHeight));
        setInputHeight((current) => (current === next ? current : next));
      }
      return;
    }
    if (node.dataset.manual === "1" || Math.abs(node.offsetHeight - programmedHeight.current) > 4) {
      if (node.dataset.manual !== "1") {
        node.dataset.manual = "1";
        const next = Math.max(singleLineHeight, Math.min(cap, node.offsetHeight));
        programmedHeight.current = next;
        setInputHeight(next);
      }
      return;
    }
    const previous = node.style.height;
    node.style.height = "auto";
    const next = Math.max(singleLineHeight, Math.min(cap, node.scrollHeight));
    node.style.height = previous;
    programmedHeight.current = next;
    setInputHeight((current) => (current === next ? current : next));
  }
  const onDroppedRef = useRef(onDropped);
  onDroppedRef.current = onDropped;

  useEffect(() => {
    if (!dropped || sending) {
      return;
    }
    clearAttempt();
    setPending(dropped);
    setNotice(droppedExtra > 0 ? "Attached the first file. Send it, then drop the next." : "");
    onDroppedRef.current?.();
  }, [dropped, droppedExtra, sending]);

  const attempt = useRef<{
    fileId?: string;
    textId?: string;
    file?: SharedFileRef;
    sentAt?: string;
    textSentAt?: string;
    fileSent?: boolean;
    textSent?: boolean;
  }>({});

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }
    const node = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!node) {
      return;
    }
    const onPaste = (event: ClipboardEvent) => {
      const fromItems = [...(event.clipboardData?.items ?? [])]
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      const fromFiles = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith("image/"));
      const images = fromItems.length > 0 ? fromItems : fromFiles;
      if (images.length === 0) {
        return;
      }
      event.preventDefault();
      const file = images[0];
      const extension = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
      const name = file.name && !/^image\./i.test(file.name) ? file.name : `Pasted image.${extension}`;
      attempt.current = {};
      setPending({
        name,
        mimeType: file.type || "image/png",
        size: file.size,
        uri: URL.createObjectURL(file),
        lastModified: file.lastModified,
        file,
      });
      setNotice(images.length > 1 ? "Attached the first image. Send it, then paste the next." : "");
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
      requestAnimationFrame(() => resizeInput());
    };
    const keepDraggedHeight = () => {
      if (Math.abs(node.offsetHeight - programmedHeight.current) > 4) {
        node.dataset.manual = "1";
        const next = Math.max(singleLineHeight, Math.min(ceilingRef.current, node.offsetHeight));
        programmedHeight.current = next;
        setInputHeight(next);
      }
    };
    const measure = () => {
      const cap = composerCeiling(node, singleLineHeight);
      ceilingRef.current = cap;
      setCeiling((current) => (Math.abs(current - cap) <= 1 ? current : cap));
    };
    node.dataset.format = "markup";
    node.dataset.resize = "true";
    node.title = "Drag the bar above to resize. Ctrl or Cmd + B bold, I italic, U underline, E code.";
    const grip = gripRef.current as unknown as HTMLElement | null;
    const unbindGrip = grip
      ? bindResizeGrip(grip, node, {
          minimum: singleLineHeight,
          ceiling: ceilingRef,
          onHeight: (next) => {
            node.dataset.manual = "1";
            programmedHeight.current = next;
            setInputHeight(next);
          },
        })
      : null;
    measure();
    const pane = node.closest("[data-file-drop='true']");
    const observer = pane && typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (pane) {
      observer?.observe(pane);
    }
    node.addEventListener("paste", onPaste);
    node.addEventListener("keydown", onKey);
    window.addEventListener("pointerup", keepDraggedHeight);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      unbindGrip?.();
      node.removeEventListener("paste", onPaste);
      node.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerup", keepDraggedHeight);
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

  const body = draft.trim();
  const ready = Boolean(body || pending) && !sending;

  useEffect(() => subscribeTransferNotice(setNotice), []);

  function clearAttempt() {
    attempt.current = {};
  }

  async function attach() {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets[0]) {
      return;
    }
    clearAttempt();
    setPending(result.assets[0]);
    setNotice("");
  }

  async function send() {
    if (!ready) {
      return;
    }
    setSending(true);
    const current = attempt.current;
    if (!current.sentAt) {
      current.sentAt = new Date().toISOString();
    }
    let attachmentSent = !pending;
    try {
      if (pending) {
        if (!current.file) {
          const uploaded = await transferChatFile(pending, audience);
          if (!uploaded) {
            return;
          }
          current.file = {
            fileId: uploaded.id,
            name: uploaded.name,
            folderId: "",
            mimeType: uploaded.mimeType,
            size: uploaded.size,
          };
        }
        if (!current.fileId) {
          current.fileId = outgoingId("file");
        }
        if (!current.fileSent) {
          onSend({ id: current.fileId, sentAt: current.sentAt, body: "", file: current.file });
          current.fileSent = true;
        }
        attachmentSent = true;
        setPending(null);
      }
      if (body) {
        if (!current.textId) {
          current.textId = outgoingId("text");
        }
        if (!current.textSentAt) {
          current.textSentAt = current.fileSent
            ? new Date(Date.parse(current.sentAt) + 1).toISOString()
            : current.sentAt;
        }
        if (!current.textSent) {
          onSend({ id: current.textId, sentAt: current.textSentAt, body });
          current.textSent = true;
        }
        setDraft("");
        setInputHeight(singleLineHeight);
        programmedHeight.current = singleLineHeight;
        const node = inputRef.current as unknown as HTMLTextAreaElement | null;
        if (node) {
          delete node.dataset.manual;
        }
        setEmojiOpen(false);
      }
      clearAttempt();
      setNotice("");
    } catch {
      setNotice(attachmentSent ? "The message didn't send. Try again." : "The attachment didn't send. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={[styles.composer, emojiOpen && styles.composerOpen]}>
      {pending ? (
        <View style={styles.pending}>
          <PaperclipIcon size={14} color={colors.muted} />
          <Text style={styles.pendingName} numberOfLines={1}>
            {pending.name}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove attachment"
            disabled={sending}
            onPress={() => {
              clearAttempt();
              setPending(null);
            }}
            style={webPointer}
          >
            <Text style={styles.pendingRemove}>Remove</Text>
          </Pressable>
        </View>
      ) : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <View
        ref={gripRef}
        accessibilityRole="adjustable"
        accessibilityLabel="Drag to resize the message box"
        style={[styles.grip, Platform.OS === "web" ? ({ cursor: "ns-resize" } as object) : null]}
      >
        <View style={styles.gripBar} />
      </View>
      <View style={styles.fieldAnchor}>
      {emojiOpen ? (
        <EmojiPicker
          anchorRef={emojiButtonRef}
          onClose={() => setEmojiOpen(false)}
          onSelect={(emoji) => {
            insertEmoji(emoji);
            setEmojiOpen(false);
          }}
        />
      ) : null}
      <View style={styles.composerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach a file"
          onPress={() => void attach()}
          style={({ pressed }) => [styles.iconButton, webPointer, pressed && styles.pressed]}
        >
          <PaperclipIcon size={18} color={colors.muted} />
        </Pressable>
        <View ref={fieldRef} style={styles.field}>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={(value) => {
              setDraft(value);
              const node = inputRef.current as unknown as HTMLTextAreaElement | null;
              if (!value && node) {
                delete node.dataset.manual;
                programmedHeight.current = singleLineHeight;
                setInputHeight(singleLineHeight);
              }
              requestAnimationFrame(resizeInput);
            }}
            multiline
            numberOfLines={1}
            blurOnSubmit={false}
            placeholder={`Message ${conversationName}...`}
            placeholderTextColor={colors.faint}
            accessibilityLabel={`Message ${conversationName}`}
            onContentSizeChange={(event) => requestAnimationFrame(() => resizeInput(event.nativeEvent.contentSize.height))}
            onKeyPress={(event) => {
              const native = event.nativeEvent as { key?: string; shiftKey?: boolean };
              if (native.key === "Enter" && !native.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            style={[
              styles.input,
              { height: inputHeight, maxHeight: ceiling },
              Platform.OS === "web" ? ({ resize: "vertical", overflowY: "auto" } as object) : null,
            ]}
          />
          <View ref={emojiButtonRef} collapsable={false}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add emoji"
              accessibilityState={{ expanded: emojiOpen }}
              onPress={() => setEmojiOpen((open) => !open)}
              style={({ pressed }) => [styles.emojiButton, webPointer, pressed && styles.pressed]}
            >
              <SmileIcon size={18} color={emojiOpen ? colors.burgundy : colors.muted} />
            </Pressable>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!ready}
          onPress={() => void send()}
          style={({ pressed }) => [styles.send, !ready && styles.sendDisabled, webPointer, pressed && ready ? styles.pressed : null]}
        >
          <ArrowUpIcon size={16} color={colors.youText} />
        </Pressable>
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  thread: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: colors.background,
  },
  conversation: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    flexDirection: "row",
    position: "relative",
  },
  header: {
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.background,
  },
  title: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  brandTitle: {
    fontWeight: "700",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotOnline: {
    backgroundColor: colors.online,
  },
  dotOffline: {
    backgroundColor: colors.faint,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 24,
  },
  note: {
    ...font.content,
    color: colors.faint,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  messages: {
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 18,
  },
  messageBlock: {
    alignSelf: "stretch",
    gap: 8,
  },
  message: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
    gap: 2,
    maxWidth: 460,
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
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  time: {
    ...font.content,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },
  bubble: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "transparent",
    borderWidth: 1,
  },
  bubbleOther: {
    borderColor: colors.line,
  },
  bubbleMine: {
    borderColor: "rgba(122, 48, 64, 0.32)",
  },
  messageBody: {
    ...font.content,
    color: colors.navy,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
    textAlign: "left",
  },
  composer: {
    paddingHorizontal: 28,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.background,
    overflow: "visible",
  },
  composerOpen: {
    zIndex: 5,
  },
  pending: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    minHeight: 28,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  pendingName: {
    ...font.content,
    flex: 1,
    minWidth: 0,
    color: colors.navy,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  pendingRemove: {
    ...font.ui,
    color: colors.faint,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  notice: {
    ...font.content,
    color: colors.burgundy,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    marginBottom: 8,
  },
  fieldAnchor: {
    position: "relative",
    zIndex: 2,
  },
  grip: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    height: 18,
    marginBottom: 2,
  },
  gripBar: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.muted,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  field: {
    flex: 1,
    minWidth: 0,
    minHeight: singleLineHeight,
    flexDirection: "row",
    alignItems: "flex-end",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingLeft: 12,
    paddingRight: 4,
  },
  emojiButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    ...font.content,
    flex: 1,
    minWidth: 0,
    marginVertical: 0,
    paddingTop: inputPad,
    paddingBottom: inputPad,
    paddingRight: 4,
    fontSize: 15,
    lineHeight: inputLineHeight,
    fontWeight: "400",
    color: colors.ink,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  send: {
    width: 36,
    height: 36,
    marginBottom: 2,
    borderRadius: 18,
    backgroundColor: colors.burgundy,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.72,
  },
});
