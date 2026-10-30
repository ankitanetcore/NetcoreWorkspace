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
  const now = new Date().toISOString();
  const stamped = { ...file, uploadedAt: file.uploadedAt || now, modifiedAt: file.modifiedAt || now };
  const stored = clientId ? { ...stamped, clientId } : stamped;
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

export function createFolder(rawName: string, parentId?: string | null) {
  const name = rawName.trim();
  if (!name) {
    return null;
  }
  const id = `folder-${createClientId()}`;
  const folder: { id: string; name: string; parentId?: string } = { id, name };
  if (parentId) {
    folder.parentId = parentId;
  }
  publishFiles(id, "folder-create", { folder });
  return id;
}

export function reorderFolders(parentId: string | null, folderIds: string[]) {
  if (folderIds.length < 2 || new Set(folderIds).size !== folderIds.length) {
    return;
  }
  publishFiles(`reorder-folders-${Date.now()}`, "folder-reorder", {
    parentId: parentId ?? "",
    folderIds,
  });
}

export function moveFolder(folderId: string, parentId: string | null) {
  if (!folderId) {
    return;
  }
  publishFiles(`move-folder-${folderId}`, "folder-move", { folderId, parentId: parentId ?? "" });
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
  publishFiles(`rename-file-${fileId}`, "file-rename", {
    fileId,
    name,
    modifiedAt: new Date().toISOString(),
  });
}

export function pinFile(fileId: string, pinned: boolean) {
  if (!fileId) {
    return;
  }
  publishFiles(`pin-file-${fileId}`, "file-pin", { fileId, pinned });
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
  const modified = typeof asset.lastModified === "number" && asset.lastModified > 0 ? new Date(asset.lastModified) : null;
  const file: WorkspaceFile = {
    id: `file-${Date.now()}`,
    name,
    detail: textFile ? "Uploaded" : "Uploaded file",
    body: textFile ? body : "This file is saved on this device. It isn't opened as text.",
    editable: textFile,
    mimeType: asset.mimeType || undefined,
    size: typeof asset.size === "number" ? asset.size : undefined,
    modifiedAt: modified && !Number.isNaN(modified.getTime()) ? modified.toISOString() : new Date().toISOString(),
  };
  publishFile(folderId, file);
  return file;
}

export async function uploadIntoFolder(folderId: string) {
  const saved = await uploadFilesIntoFolder(folderId);
  return saved[0] ?? null;
}

export async function uploadFilesIntoFolder(folderId: string) {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: true,
  });
  if (result.canceled) {
    return [];
  }
  const saved: WorkspaceFile[] = [];
  for (const asset of result.assets) {
    const file = await uploadAssetIntoFolder(folderId, asset);
    if (file) {
      saved.push(file);
    }
  }
  return saved;
}
