export function isImageFile(name: string, mimeType?: string | null) {
  if (mimeType === "image/svg+xml") {
    return false;
  }
  if (mimeType?.startsWith("image/")) {
    return true;
  }
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
}

export function isPdfFile(name: string, mimeType?: string | null) {
  return mimeType === "application/pdf" || /\.pdf$/i.test(name);
}

export function isVideoFile(name: string, mimeType?: string | null) {
  if (mimeType?.startsWith("video/")) {
    return true;
  }
  return /\.(mp4|webm|mov|m4v|ogv)$/i.test(name);
}

export function isTextFile(name: string, mimeType?: string | null) {
  if (mimeType?.startsWith("text/")) {
    return true;
  }
  if (mimeType === "application/json" || mimeType === "application/xml") {
    return true;
  }
  return /\.(txt|md|json|csv|ts|tsx|js|jsx|css|html|xml|yml|yaml)$/i.test(name);
}

export function fileTypeLabel(name: string, mimeType?: string | null) {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).trim() : "";
  if (ext && ext.length <= 8) {
    return ext.toUpperCase();
  }
  if (mimeType?.startsWith("text/")) {
    return "Text";
  }
  if (mimeType?.startsWith("image/")) {
    return "Image";
  }
  return "File";
}

export type FilePreviewKind = "image" | "video" | "pdf" | "text" | "audio" | "unsupported";

const previewTextExtensions =
  /\.(txt|md|json|csv|tsv|log|ts|tsx|js|jsx|mjs|cjs|css|html|xml|yml|yaml|py|rb|go|rs|java|c|h|cpp|cc|sh|sql|toml|ini)$/i;
const audioExtensions = /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus)$/i;

/**
 * Files preview refuses to render above these sizes. Video uses the browser player,
 * so its cap is only the point where a fully buffered clip is too large to hand to that player.
 */
export const previewByteLimit: Record<Exclude<FilePreviewKind, "unsupported">, number> = {
  image: 20 * 1024 * 1024,
  video: 200 * 1024 * 1024,
  pdf: 25 * 1024 * 1024,
  text: 1024 * 1024,
  audio: 50 * 1024 * 1024,
};

function mimeOf(mimeType?: string | null) {
  return mimeType?.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isAudioFile(name: string, mimeType?: string | null) {
  const mime = mimeOf(mimeType);
  if (mime.startsWith("audio/")) {
    return true;
  }
  if (mime && mime !== "application/octet-stream") {
    return false;
  }
  return audioExtensions.test(name);
}

export function filePreviewKind(name: string, mimeType?: string | null): FilePreviewKind {
  const mime = mimeOf(mimeType);
  const generic = !mime || mime === "application/octet-stream";
  if (!generic) {
    if (mime === "image/svg+xml") {
      return "unsupported";
    }
    if (mime.startsWith("image/")) {
      return "image";
    }
    if (mime.startsWith("video/")) {
      return "video";
    }
    if (mime === "application/pdf") {
      return "pdf";
    }
    if (mime.startsWith("audio/")) {
      return "audio";
    }
    if (
      mime.startsWith("text/") ||
      mime === "application/json" ||
      mime === "application/xml" ||
      mime === "application/javascript" ||
      mime === "application/typescript"
    ) {
      return "text";
    }
  }
  if (isImageFile(name, generic ? undefined : mime)) {
    return "image";
  }
  if (isVideoFile(name, generic ? undefined : mime)) {
    return "video";
  }
  if (isPdfFile(name, generic ? undefined : mime)) {
    return "pdf";
  }
  if (isAudioFile(name, generic ? undefined : mime)) {
    return "audio";
  }
  if (isTextFile(name, generic ? undefined : mime) || previewTextExtensions.test(name)) {
    return "text";
  }
  return "unsupported";
}

export function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
