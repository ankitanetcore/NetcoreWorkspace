import type { MessageReaction, RoomMessage } from "@/domain/types";

export const quickReactions = ["👍", "❤️", "😄", "🎉", "👀", "🙏"];

export function toggleReaction(message: RoomMessage, emoji: string, actorId: string) {
  const glyph = emoji.trim();
  if (!glyph || glyph.length > 32 || /[\u0000-\u001f]/.test(glyph) || !actorId) {
    return;
  }
  const reactions = (message.reactions ?? []).map((reaction) => ({
    emoji: reaction.emoji,
    authorIds: [...reaction.authorIds],
  }));
  const existing = reactions.find((reaction) => reaction.emoji === glyph);
  if (!existing) {
    reactions.push({ emoji: glyph, authorIds: [actorId] });
  } else if (existing.authorIds.includes(actorId)) {
    existing.authorIds = existing.authorIds.filter((id) => id !== actorId);
  } else {
    existing.authorIds.push(actorId);
  }
  const next = reactions.filter((reaction) => reaction.authorIds.length > 0);
  message.reactions = next.length > 0 ? next : undefined;
}

export function reactionList(value: MessageReaction[] | undefined) {
  return value ?? [];
}
