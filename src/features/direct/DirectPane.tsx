import * as DocumentPicker from "expo-document-picker";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

import { BackButton } from "@/components/BackButton";
import { UploadIcon } from "@/components/UploadIcon";
import type { FileAudience, RoomMessage, SharedFileRef } from "@/domain/types";
import { sendDirectMessage, threadForPeer } from "@/features/direct/direct";
import { assetFromFile } from "@/features/files/desktopFile";
import { FileDropSurface } from "@/features/files/FileDropSurface";
import { SharedFileCard } from "@/features/files/SharedFileCard";
import { transferChatFile } from "@/features/files/transferBytes";
import { subscribeTransferNotice } from "@/features/files/transferNotice";
import { columnTextStyle } from "@/features/messages/columnText";
import { EmojiPicker } from "@/features/messages/EmojiPicker";
import { continuesSender } from "@/features/messages/preview";
import { markRead } from "@/features/messages/readState";
import { useKnownPeers } from "@/features/rooms/RoomDialogs";
import { displayNameFor } from "@/session/displayName";
import { useSession } from "@/session/Session";
import { webPointer } from "@/theme/pressable";
import { colors, font, text } from "@/theme/tokens";
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
        <View style={[styles.dot, online ? styles.dotOnline : styles.dotOffline]} />
        <View style={styles.title}>
          <Text accessibilityRole="header" style={[text.title, font.brand, styles.brandTitle]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[text.meta, font.content]}>{online ? "Connected" : "Not connected"}</Text>
        </View>
      </View>
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
      {messages.length === 0 ? (
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
          {messages.map((message, index) => (
            <DirectMessage
              key={message.id}
              message={message}
              mine={message.authorId === clientId}
              grouped={continuesSender(messages[index - 1], message)}
              author={displayNameFor(peers, message.authorId, message.author, { clientId, name })}
            />
          ))}
        </ScrollView>
      )}
      <Composer
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
    </View>
  );
}

function DirectMessage({
  message,
  mine,
  grouped,
  author,
}: {
  message: RoomMessage;
  mine: boolean;
  grouped: boolean;
  author: string;
}) {
  const attachmentOnly = Boolean(message.file) && !message.body?.trim();
  return (
    <View style={[styles.message, mine && styles.messageMine, grouped && styles.messageGrouped]}>
      {grouped ? null : (
        <View style={styles.meta}>
          <Text style={styles.author}>{author}</Text>
          <Text style={styles.time}>{message.time}</Text>
        </View>
      )}
      {message.body?.trim() ? (
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
          <Text style={[styles.messageBody, columnTextStyle(message.body)]}>{message.body}</Text>
        </View>
      ) : null}
      {message.file ? <SharedFileCard file={message.file} solo={attachmentOnly} suggest={mine} /> : null}
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

const singleLineHeight = 52;

function useComposerFrame(fieldRef: { current: View | null }) {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      return;
    }
    const node = fieldRef.current as unknown as HTMLElement | null;
    node?.setAttribute("data-composer", "field");
    if (document.getElementById("netcore-composer")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "netcore-composer";
    style.textContent = `
      [data-composer="field"]:focus-within {
        border-color: rgba(122, 48, 64, 0.4);
      }
      [data-composer="field"] textarea {
        outline: none;
        border: none;
        box-shadow: none;
        background: transparent;
        resize: none;
      }
      [data-composer="field"] textarea:focus,
      [data-composer="field"] textarea:focus-visible {
        outline: none;
        border: none;
        box-shadow: none;
      }
    `;
    document.head.appendChild(style);
  }, []);
}

export function Composer({
  audience,
  onSend,
  dropped = null,
  droppedExtra = 0,
  onDropped,
}: {
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
  const [emojiOpen, setEmojiOpen] = useState(false);
  const fieldRef = useRef<View>(null);
  const emojiButtonRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);
  useComposerFrame(fieldRef);

  function insertEmoji(emoji: string) {
    const node = inputRef.current as unknown as HTMLTextAreaElement | null;
    const start = typeof node?.selectionStart === "number" ? node.selectionStart : draft.length;
    const end = typeof node?.selectionEnd === "number" ? node.selectionEnd : draft.length;
    const next = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    const cursor = start + emoji.length;
    setDraft(next);
    requestAnimationFrame(() => {
      node?.focus();
      node?.setSelectionRange(cursor, cursor);
      resizeInput();
    });
  }

  function resizeInput() {
    const node = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!node || Platform.OS !== "web") {
      return;
    }
    node.style.height = `${singleLineHeight}px`;
    const next = Math.max(singleLineHeight, Math.min(120, node.scrollHeight));
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
      <View ref={fieldRef} style={styles.field}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach a file"
          onPress={() => void attach()}
          style={({ pressed }) => [styles.attach, webPointer, pressed && styles.pressed]}
        >
          <UploadIcon />
        </Pressable>
        <View style={styles.attachDivider} />
        <View ref={emojiButtonRef} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add emoji"
          accessibilityState={{ expanded: emojiOpen }}
          onPress={() => setEmojiOpen((open) => !open)}
          style={({ pressed, hovered }) => [
            styles.mode,
            (emojiOpen || hovered) && styles.modeOn,
            webPointer,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.modeGlyph}>☺</Text>
        </Pressable>
        </View>
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={(value) => {
            setDraft(value);
            requestAnimationFrame(resizeInput);
          }}
          multiline
          numberOfLines={1}
          blurOnSubmit={false}
          accessibilityLabel="Message"
          onContentSizeChange={() => requestAnimationFrame(resizeInput)}
          onKeyPress={(event) => {
            const native = event.nativeEvent as { key?: string; shiftKey?: boolean };
            if (native.key === "Enter" && !native.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          style={[styles.input, { height: inputHeight }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!ready}
          onPress={() => void send()}
          style={({ pressed }) => [styles.send, !ready && styles.sendDisabled, webPointer, pressed && ready ? styles.pressed : null]}
        >
          <Text style={styles.sendLabel}>Send</Text>
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
    minHeight: 28,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  field: {
    minHeight: 54,
    maxHeight: 140,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingLeft: 4,
    paddingRight: 8,
  },
  attach: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  attachDivider: {
    width: 1,
    alignSelf: "stretch",
    marginVertical: 10,
    backgroundColor: colors.line,
  },
  mode: {
    width: 28,
    height: 28,
    marginLeft: 2,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  modeOn: {
    backgroundColor: colors.burgundySoft,
  },
  modeGlyph: {
    color: colors.burgundy,
    fontSize: 16,
    lineHeight: 18,
  },
  input: {
    ...font.content,
    flex: 1,
    minWidth: 0,
    maxHeight: 120,
    marginVertical: 0,
    paddingTop: 15,
    paddingBottom: 15,
    paddingHorizontal: 8,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
    color: colors.ink,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  send: {
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.burgundy,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: {
    opacity: 0.4,
  },
  sendLabel: {
    ...font.ui,
    color: colors.youText,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.72,
  },
});
