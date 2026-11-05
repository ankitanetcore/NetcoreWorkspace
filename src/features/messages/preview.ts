import { sentDay } from "@/features/messages/sentWhen";

export function continuesSender(
  previous: { authorId?: string; sentAt?: string } | undefined,
  message: { authorId?: string; sentAt?: string },
) {
  if (!previous?.authorId || previous.authorId !== message.authorId) {
    return false;
  }
  if (sentDay(previous.sentAt) !== sentDay(message.sentAt)) {
    return false;
  }
  const left = Date.parse(previous.sentAt || "");
  const right = Date.parse(message.sentAt || "");
  return Number.isFinite(left) && Number.isFinite(right) && right >= left && right - left <= 5 * 60 * 1000;
}

export function followsAttachment(
  previous: { authorId?: string; body?: string; file?: unknown; sentAt?: string } | undefined,
  message: { authorId?: string; body?: string; file?: unknown; sentAt?: string },
) {
  if (!previous?.file || previous.body?.trim() || message.file || !message.body?.trim()) {
    return false;
  }
  if (!previous.authorId || previous.authorId !== message.authorId) {
    return false;
  }
  const left = Date.parse(previous.sentAt || "");
  const right = Date.parse(message.sentAt || "");
  return Number.isFinite(left) && Number.isFinite(right) && right >= left && right - left <= 2000;
}

export function shownInChannel(message: { parentId?: string; inChannel?: boolean }) {
  return !message.parentId || message.inChannel === true;
}

export function channelMessages<T extends { parentId?: string; inChannel?: boolean }>(messages: T[]) {
  return messages.filter(shownInChannel);
}

export function repliesTo<T extends { parentId?: string }>(messages: T[], parentId: string) {
  return messages.filter((message) => message.parentId === parentId);
}

export function previewText(message: { body?: string; file?: { name?: string } | null }) {
  const body = message.body?.trim() ?? "";
  if (body) {
    return body.replace(/```/g, "").replace(/\*\*|\+\+|`/g, "");
  }
  if (message.file?.name) {
    return message.file.name;
  }
  return "";
}
