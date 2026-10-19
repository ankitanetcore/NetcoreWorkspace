import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";

import type { WorkspaceFile } from "@/domain/types";
import { isTextFile } from "@/features/files/fileKind";
import { transferUploadedFile } from "@/features/files/transferBytes";
import { createClientId } from "@/session/createClientId";
import { currentClientId } from "@/session/currentIdentity";
import { getTransport } from "@/transport";

function uniqueName(folderId: string, requested: string) {
  const folder = getTransport()
    .snapshot("files")
    .folders.find((item) => item.id === folderId);
  const used = new Set(folder?.files.map((file) => file.name) ?? []);
  if (!used.has(requested)) {
    return requested;
  }
  const dot = requested.lastIndexOf(".");
  const stem = dot > 0 ? requested.slice(0, dot) : requested;
  const ext = dot > 0 ? requested.slice(dot) : "";
  let count = 2;
  let next = `${stem}-${count}${ext}`;
  while (used.has(next)) {
    count += 1;
    next = `${stem}-${count}${ext}`;
  }
  return next;
}

function publishFile(folderId: string, file: WorkspaceFile) {
  const clientId = currentClientId();
  const stored = clientId ? { ...file, clientId } : file;
  getTransport().publish({
    id: stored.id,
    topic: "files",
    type: "create",
    sentAt: new Date().toISOString(),
    clientId: clientId || undefined,
    payload: { folderId, file: stored, clientId },
  });
}

function publishFiles(id: string, type: string, payload: unknown) {
  const clientId = currentClientId();
  getTransport().publish({
    id,
    topic: "files",
    type,
    sentAt: new Date().toISOString(),
    clientId: clientId || undefined,
    payload,
  });
}

export function createFolder(rawName: string) {
  const name = rawName.trim();
  if (!name) {
    return null;
  }
  const id = `folder-${createClientId()}`;
  publishFiles(id, "folder-create", { folder: { id, name } });
  return id;
}

export function renameFolder(folderId: string, rawName: string) {
  const name = rawName.trim();
  if (!folderId || !name) {
    return;
  }
  publishFiles(`rename-folder-${folderId}`, "folder-rename", { folderId, name });
}

export function deleteFolder(folderId: string) {
  if (!folderId) {
    return;
  }
  publishFiles(`delete-folder-${folderId}`, "folder-delete", { folderId });
}

export function renameFile(fileId: string, rawName: string) {
  const name = rawName.trim();
  if (!fileId || !name) {
    return;
  }
  publishFiles(`rename-file-${fileId}`, "file-rename", { fileId, name });
}

export function deleteFile(fileId: string) {
  if (!fileId) {
    return;
  }
  publishFiles(`delete-file-${fileId}`, "file-delete", { fileId });
}

export function organizeFile(fileId: string, folderId: string) {
  if (!fileId || !folderId) {
    return;
  }
  publishFiles(`organize-${fileId}-${folderId}`, "file-organize", { fileId, folderId });
}

export function moveFile(fileId: string, toFolderId: string) {
  if (!fileId || !toFolderId) {
    return;
  }
  publishFiles(`move-${fileId}-${toFolderId}`, "file-move", { fileId, toFolderId });
}

export function createEditableFile(folderId: string, rawName: string) {
  const trimmed = rawName.trim();
  const requested = trimmed.length === 0 ? "untitled.txt" : trimmed.includes(".") ? trimmed : `${trimmed}.txt`;
  const file: WorkspaceFile = {
    id: `file-${Date.now()}`,
    name: uniqueName(folderId, requested),
    detail: "Editing",
    body: "",
    editable: true,
  };
  publishFile(folderId, file);
  return file;
}

export function updateEditableFile(folderId: string, fileId: string, body: string) {
  const clientId = currentClientId();
  getTransport().publish({
    id: `edit-${fileId}`,
    topic: "files",
    type: "update",
    sentAt: new Date().toISOString(),
    clientId: clientId || undefined,
    payload: { folderId, fileId, body, clientId },
  });
}

async function readAsset(asset: DocumentPicker.DocumentPickerAsset) {
  if (asset.file) {
    return asset.file.text();
  }
  return new File(asset.uri).text();
}

export async function uploadAssetIntoFolder(folderId: string, asset: DocumentPicker.DocumentPickerAsset) {
  const name = uniqueName(folderId, asset.name);
  const transferred = await transferUploadedFile(folderId, asset, name);
  if (transferred.handled) {
    return transferred.file;
  }
  const textFile = isTextFile(asset.name, asset.mimeType);
  let body = "";
  if (textFile) {
    try {
      body = await readAsset(asset);
    } catch {
      body = "";
    }
  }
  const file: WorkspaceFile = {
    id: `file-${Date.now()}`,
    name,
    detail: textFile ? "Uploaded" : "Uploaded file",
    body: textFile ? body : "This file is saved on this device. It isn't opened as text.",
    editable: textFile,
  };
  publishFile(folderId, file);
  return file;
}

export async function uploadIntoFolder(folderId: string) {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) {
    return null;
  }
  const asset = result.assets[0];
  if (!asset) {
    return null;
  }
  return uploadAssetIntoFolder(folderId, asset);
}
