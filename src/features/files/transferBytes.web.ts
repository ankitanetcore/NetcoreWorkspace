import type { DocumentPickerAsset } from "expo-document-picker";

import type { FileAudience, WorkspaceFile } from "@/domain/types";
import { setFileDownload } from "@/features/files/downloads";
import { formatBytes, isTextFile } from "@/features/files/fileKind";
import { clearTransferNotice, reportTransferFailure, transferNotice } from "@/features/files/transferNotice";
import { currentClientId } from "@/session/currentIdentity";
import { connectionPhase } from "@/transport/connectionPhase";
import { getTransport } from "@/transport";

const chunkSize = 16 * 1024;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

async function readBytes(asset: DocumentPickerAsset) {
  if (asset.file) {
    return new Uint8Array(await asset.file.arrayBuffer());
  }
  if (!asset.uri) {
    return null;
  }
  const response = await fetch(asset.uri);
  return new Uint8Array(await response.arrayBuffer());
}

function publishTransfer(file: WorkspaceFile, bytes: Uint8Array, folderId: string, audience?: FileAudience) {
  const transferId = `transfer-${file.id}`;
  const chunkCount = Math.max(1, Math.ceil(bytes.byteLength / chunkSize));
  const clientId = currentClientId();
  const transport = getTransport();
  if (folderId) {
    transport.publish({
      id: file.id,
      topic: "files",
      type: "create",
      sentAt: new Date().toISOString(),
      clientId: clientId || undefined,
      payload: { folderId, file, clientId },
    });
  }
  transport.publish({
    id: `${transferId}-start`,
    topic: "files",
    type: "file-start",
    sentAt: new Date().toISOString(),
    clientId: clientId || undefined,
    payload: {
      transferId,
      folderId,
      fileId: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      chunkCount,
      editable: file.editable,
      body: file.body,
      detail: file.detail,
      clientId,
      audience,
    },
  });
  for (let index = 0; index < chunkCount; index += 1) {
    const slice = bytes.subarray(index * chunkSize, Math.min(bytes.byteLength, (index + 1) * chunkSize));
    transport.publish({
      id: `${transferId}-${index}`,
      topic: "files",
      type: "file-chunk",
      sentAt: new Date().toISOString(),
      clientId: clientId || undefined,
      payload: { transferId, index, data: bytesToBase64(slice), clientId },
    });
  }
  transport.publish({
    id: `${transferId}-end`,
    topic: "files",
    type: "file-end",
    sentAt: new Date().toISOString(),
    clientId: clientId || undefined,
    payload: { transferId, clientId },
  });
}

async function prepareUpload(asset: DocumentPickerAsset, name: string) {
  if (connectionPhase() !== "connected") {
    reportTransferFailure(name);
    return null;
  }
  const bytes = await readBytes(asset);
  if (!bytes) {
    reportTransferFailure(name);
    return null;
  }
  clearTransferNotice();
  const mimeType = asset.mimeType || "application/octet-stream";
  const text = isTextFile(name, mimeType);
  const clientId = currentClientId();
  const file: WorkspaceFile = {
    id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    detail: `Uploaded · ${formatBytes(bytes.byteLength)}`,
    body: text ? new TextDecoder().decode(bytes) : "This file isn't opened as text.",
    editable: text,
    mimeType,
    size: bytes.byteLength,
    clientId: clientId || undefined,
  };
  setFileDownload(file.id, URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeType })));
  return { file, bytes };
}

export async function transferUploadedFile(
  folderId: string,
  asset: DocumentPickerAsset,
  name: string,
): Promise<{ handled: false } | { handled: true; file: WorkspaceFile | null }> {
  const prepared = await prepareUpload(asset, name);
  if (!prepared) {
    return { handled: true, file: null };
  }
  publishTransfer(prepared.file, prepared.bytes, folderId);
  return { handled: true, file: prepared.file };
}

export async function transferChatFile(asset: DocumentPickerAsset, audience: FileAudience) {
  const prepared = await prepareUpload(asset, asset.name);
  if (!prepared) {
    return null;
  }
  publishTransfer(prepared.file, prepared.bytes, "", audience);
  if (transferNotice()) {
    return null;
  }
  return prepared.file;
}
