export interface CallParticipant {
  id: string;
  name: string;
  muted: boolean;
  cameraOff: boolean;
  stream: unknown;
}

export interface RoomCallControls {
  muted: boolean;
  cameraOff: boolean;
  localStream: unknown;
  participants: CallParticipant[];
  toggleMute: () => void;
  toggleCamera: () => void;
  leave: () => void;
}
