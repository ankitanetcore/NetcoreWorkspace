import type { WorkspaceFolder } from "@/domain/types";

export function folderParentId(folders: WorkspaceFolder[], folder: WorkspaceFolder) {
  if (!folder.parentId) {
    return null;
  }
  return folders.some((item) => item.id === folder.parentId) ? folder.parentId : null;
}

function folderOrder(folder: WorkspaceFolder) {
  return typeof folder.order === "number" && Number.isFinite(folder.order) ? folder.order : Number.MAX_SAFE_INTEGER;
}

export function childFolders(folders: WorkspaceFolder[], parentId: string | null) {
  return folders
    .filter((folder) => folderParentId(folders, folder) === parentId)
    .sort(
      (left, right) =>
        folderOrder(left) - folderOrder(right) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    );
}

export function folderChain(folders: WorkspaceFolder[], folderId: string | null) {
  const chain: WorkspaceFolder[] = [];
  const seen = new Set<string>();
  let current = folders.find((folder) => folder.id === folderId) ?? null;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    const parentId = folderParentId(folders, current);
    current = parentId ? folders.find((folder) => folder.id === parentId) ?? null : null;
  }
  return chain;
}

export function nestedFolderIds(folders: WorkspaceFolder[], rootId: string) {
  const ids = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      const parentId = folderParentId(folders, folder);
      if (parentId && ids.has(parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        grew = true;
      }
    }
  }
  return ids;
}
