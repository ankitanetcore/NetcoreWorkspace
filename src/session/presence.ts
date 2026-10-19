type PresenceSender = (displayName: string) => void;

export function bindPresenceSender(_next: PresenceSender) {}

export function announcePresence(_displayName: string) {}
