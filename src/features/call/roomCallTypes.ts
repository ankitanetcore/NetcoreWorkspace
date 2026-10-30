export interface CallParticipant {
  id: string;
  name: string;
  muted: boolean;
  cameraOff: boolean;
  stream: unknown;
  screenStream: unknown;
}

export interface RoomCallControls {
  muted: boolean;
  cameraOff: boolean;
  sharing: boolean;
  localStream: unknown;
  screenStream: unknown;
  participants: CallParticipant[];
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleScreenShare: () => void;
  leave: () => void;
}
