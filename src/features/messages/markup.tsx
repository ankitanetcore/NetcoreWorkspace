import { Platform, Text, type GestureResponderEvent, type TextStyle } from "react-native";

import { usesColumnSpacing } from "@/features/messages/columnText";

const messageUrlPattern = /https?:\/\/[^\s]+/i;

export type TextMark = "bold" | "italic" | "underline" | "code";

const markers: Record<Exclude<TextMark, "code">, string> = {
  bold: "**",
  italic: "*",
  underline: "++",
};

export function shortcutMark(event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): TextMark | null {
  const command = event.metaKey || event.ctrlKey;
  if (!command || event.altKey || event.shiftKey) {
    return null;
  }
  const key = event.key.toLowerCase();
  if (key === "b") {
    return "bold";
  }
  if (key === "i") {
    return "italic";
  }
  if (key === "u") {
    return "underline";
  }
  if (key === "e") {
    return "code";
  }
  return null;
}

export function applyMark(value: string, start: number, end: number, mark: TextMark) {
  const selected = value.slice(start, end);
  if (mark === "code" && selected.includes("\n")) {
    return toggleWrap(value, start, end, "```\n", "\n```");
  }
  const marker = mark === "code" ? "`" : markers[mark];
  return toggleWrap(value, start, end, marker, marker);
}

function toggleWrap(value: string, start: number, end: number, open: string, close: string) {
  const selected = value.slice(start, end);
  const before = value.slice(Math.max(0, start - open.length), start);
  const after = value.slice(end, end + close.length);
  if (before === open && after === close) {
    const next = `${value.slice(0, start - open.length)}${selected}${value.slice(end + close.length)}`;
    const cursor = start - open.length;
    return { value: next, start: cursor, end: cursor + selected.length };
  }
  if (selected.startsWith(open) && selected.endsWith(close) && selected.length >= open.length + close.length) {
    const inner = selected.slice(open.length, selected.length - close.length);
    return { value: `${value.slice(0, start)}${inner}${value.slice(end)}`, start, end: start + inner.length };
  }
  const wrapped = `${open}${selected}${close}`;
  const cursor = start + open.length;
  return {
    value: `${value.slice(0, start)}${wrapped}${value.slice(end)}`,
    start: cursor,
    end: cursor + selected.length,
  };
}

type Piece =
  | { kind: "text"; text: string }
  | { kind: "bold" | "italic" | "underline"; children: Piece[] }
  | { kind: "code"; text: string }
  | { kind: "block"; text: string }
  | { kind: "link"; text: string; href: string };

function takeUntil(source: string, from: number, marker: string) {
  const close = source.indexOf(marker, from);
  if (close < 0) {
    return null;
  }
  return { inner: source.slice(from, close), next: close + marker.length };
}

function parse(source: string): Piece[] {
  const pieces: Piece[] = [];
  let index = 0;
  let plain = "";
  const flush = () => {
    if (!plain) {
      return;
    }
    pieces.push(...parsePlain(plain));
    plain = "";
  };
  while (index < source.length) {
    if (source.startsWith("```", index)) {
      const found = takeUntil(source, index + 3, "```");
      if (found) {
        flush();
        pieces.push({ kind: "block", text: found.inner.replace(/^\n/, "").replace(/\n$/, "") });
        index = found.next;
        continue;
      }
    }
    if (source.startsWith("**", index)) {
      const found = takeUntil(source, index + 2, "**");
      if (found) {
        flush();
        pieces.push({ kind: "bold", children: parse(found.inner) });
        index = found.next;
        continue;
      }
    }
    if (source.startsWith("++", index)) {
      const found = takeUntil(source, index + 2, "++");
      if (found) {
        flush();
        pieces.push({ kind: "underline", children: parse(found.inner) });
        index = found.next;
        continue;
      }
    }
    if (source[index] === "`") {
      const found = takeUntil(source, index + 1, "`");
      if (found && !found.inner.includes("\n")) {
        flush();
        pieces.push({ kind: "code", text: found.inner });
        index = found.next;
        continue;
      }
    }
    if (source[index] === "*" && source[index + 1] !== "*") {
      const found = takeUntil(source, index + 1, "*");
      if (found && !found.inner.includes("*")) {
        flush();
        pieces.push({ kind: "italic", children: parse(found.inner) });
        index = found.next;
        continue;
      }
    }
    plain += source[index];
    index += 1;
  }
  flush();
  return pieces;
}

function parsePlain(source: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  const pattern = new RegExp(messageUrlPattern.source, "gi");
  for (const match of source.matchAll(pattern)) {
    const start = match.index ?? 0;
    const raw = match[0];
    if (start > last) {
      pieces.push({ kind: "text", text: source.slice(last, start) });
    }
    const href = raw.replace(/[),.;:!?]+$/g, "") || raw;
    pieces.push({ kind: "link", text: href, href });
    if (href.length < raw.length) {
      pieces.push({ kind: "text", text: raw.slice(href.length) });
    }
    last = start + raw.length;
  }
  if (last < source.length) {
    pieces.push({ kind: "text", text: source.slice(last) });
  }
  return pieces;
}

const mono =
  Platform.OS === "web"
    ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'
    : "monospace";

function hasMarkup(source: string) {
  return source.includes("`") || source.includes("**") || source.includes("++") || /\*[^*\n]+\*/.test(source);
}

export function MessageBody({
  body,
  onLink,
  baseStyle,
  linkStyle,
}: {
  body: string;
  onLink: (event: GestureResponderEvent, href: string) => void;
  baseStyle: TextStyle;
  linkStyle: TextStyle;
}) {
  const pieces = usesColumnSpacing(body) && !hasMarkup(body) ? parsePlain(body) : parse(body);
  return <Text style={baseStyle}>{renderPieces(pieces, onLink, linkStyle)}</Text>;
}

function renderPieces(
  pieces: Piece[],
  onLink: (event: GestureResponderEvent, href: string) => void,
  linkStyle: TextStyle,
) {
  return pieces.map((piece, index) => {
    if (piece.kind === "text") {
      return piece.text;
    }
    if (piece.kind === "link") {
      return (
        <Text key={`link-${index}`} accessibilityRole="link" style={linkStyle} onPress={(event) => onLink(event, piece.href)}>
          {piece.text}
        </Text>
      );
    }
    if (piece.kind === "code") {
      return (
        <Text key={`code-${index}`} style={codeStyle}>
          {piece.text}
        </Text>
      );
    }
    if (piece.kind === "block") {
      return (
        <Text key={`block-${index}`} style={blockStyle}>
          {`\n${piece.text}\n`}
        </Text>
      );
    }
    const style = piece.kind === "bold" ? boldStyle : piece.kind === "italic" ? italicStyle : underlineStyle;
    return (
      <Text key={`${piece.kind}-${index}`} style={style}>
        {renderPieces(piece.children, onLink, linkStyle)}
      </Text>
    );
  });
}

const boldStyle: TextStyle = { fontWeight: "700" };
const italicStyle: TextStyle = { fontStyle: "italic" };
const underlineStyle: TextStyle = { textDecorationLine: "underline" };
const preWrap = Platform.OS === "web" ? ({ whiteSpace: "pre-wrap" } as TextStyle) : null;
const codeStyle: TextStyle = {
  fontFamily: mono,
  fontSize: 13,
  backgroundColor: "rgba(20, 32, 51, 0.08)",
  ...preWrap,
};
const blockStyle: TextStyle = {
  fontFamily: mono,
  fontSize: 13,
  lineHeight: 18,
  backgroundColor: "rgba(20, 32, 51, 0.08)",
  ...preWrap,
};
