export interface StagedCamera {
  stream: MediaStream;
}

let staged: StagedCamera | null = null;

export function stageCamera(camera: StagedCamera) {
  staged = camera;
}

export function takeStagedCamera() {
  const camera = staged;
  staged = null;
  return camera;
}
