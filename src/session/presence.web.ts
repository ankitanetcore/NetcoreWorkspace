type PresenceSender = (displayName: string) => void;

let sender: PresenceSender | null = null;

export function bindPresenceSender(next: PresenceSender) {
  sender = next;
}

export function announcePresence(displayName: string) {
  sender?.(displayName);
}
