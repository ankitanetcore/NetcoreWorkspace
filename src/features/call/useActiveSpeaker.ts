export function useActiveSpeaker(_tiles: { id: string; muted: boolean; stream: unknown }[]): {
  id: string | null;
  speaking: boolean;
} {
  return { id: null, speaking: false };
}
