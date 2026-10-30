const MAX_EDGE = 160;
const MAX_CHARS = 90000;

export async function readProfilePhoto(file: Blob): Promise<string | null> {
  if (!file.type.startsWith("image/")) {
    return null;
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return null;
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let quality = 0.72;
  let uri = canvas.toDataURL("image/jpeg", quality);
  while (uri.length > MAX_CHARS && quality > 0.4) {
    quality -= 0.12;
    uri = canvas.toDataURL("image/jpeg", quality);
  }
  return uri.length <= MAX_CHARS ? uri : null;
}
