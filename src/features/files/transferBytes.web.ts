import type { DocumentPickerAsset } from "expo-document-picker";

import type { FileAudience, WorkspaceFile } from "@/domain/types";
import { setFileDownload } from "@/features/files/downloads";
import { clearTransferNotice, reportTransferFailure, reportTransferProgress, transferNotice } from "@/features/files/transferNotice";
import { currentClientId } from "@/session/currentIdentity";
import { connectionPhase } from "@/transport/connectionPhase";

const maxUploadBytes = 8 * 1024 * 1024 * 1024;

function postFile(file: File, meta: Record<string, unknown>, name: string) {
  return new Promise<WorkspaceFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/upload");
    xhr.withCredentials = true;
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.setRequestHeader("x-workspace-upload", encodeURIComponent(JSON.stringify(meta)));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        reportTransferProgress(name, event.loaded, event.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(String(xhr.status)));
        return;
      }
      try {
        const parsed = JSON.parse(xhr.responseText) as { file?: WorkspaceFile };
        if (!parsed.file?.id) {
          reject(new Error("empty"));
          return;
        }
        resolve(parsed.file);
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

async function uploadFile(asset: DocumentPickerAsset, name: string, folderId: string, audience?: FileAudience) {
  if (connectionPhase() !== "connected") {
    reportTransferFailure(name);
    return null;
  }
  const source = asset.file;
  if (!source) {
    reportTransferFailure(name);
    return null;
  }
  if (source.size > maxUploadBytes) {
    reportTransferFailure(name, `${name} is larger than 8 GB, so it wasn't sent.`);
    return null;
  }
  clearTransferNotice();
  const clientId = currentClientId();
  try {
    const stored = await postFile(
      source,
      {
        fileId: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        mimeType: asset.mimeType || source.type || "application/octet-stream",
        folderId,
        audience,
        clientId,
      },
      name,
    );
    setFileDownload(stored.id, `/media/${encodeURIComponent(stored.id)}`);
    clearTransferNotice();
    return stored;
  } catch (error) {
    const status = error instanceof Error ? error.message : "";
    reportTransferFailure(
      name,
      status === "413" ? `${name} is larger than 8 GB, so it wasn't sent.` : undefined,
    );
    return null;
  }
}

export async function transferUploadedFile(
  folderId: string,
  asset: DocumentPickerAsset,
  name: string,
): Promise<{ handled: false } | { handled: true; file: WorkspaceFile | null }> {
  const stored = await uploadFile(asset, name, folderId);
  return { handled: true, file: stored };
}

export async function transferChatFile(asset: DocumentPickerAsset, audience: FileAudience) {
  const stored = await uploadFile(asset, asset.name, "", audience);
  if (!stored || transferNotice()) {
    return null;
  }
  return stored;
}
