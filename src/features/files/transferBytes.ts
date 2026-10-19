import type { DocumentPickerAsset } from "expo-document-picker";

import type { WorkspaceFile } from "@/domain/types";

export async function transferChatFile(
  _asset: DocumentPickerAsset,
  _audience: { kind: "room" | "direct"; roomId?: string; participantIds?: string[] },
): Promise<WorkspaceFile | null> {
  return null;
}

export async function transferUploadedFile(
  _folderId: string,
  _asset: DocumentPickerAsset,
  _name: string,
): Promise<{ handled: false } | { handled: true; file: WorkspaceFile | null }> {
  return { handled: false };
}
