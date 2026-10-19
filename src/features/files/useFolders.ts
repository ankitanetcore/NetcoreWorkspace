import { useEffect, useState } from "react";

import { getTransport } from "@/transport";

export function useFolders() {
  const [, setTick] = useState(0);
  useEffect(() => {
    return getTransport().subscribe("files", () => {
      setTick((value) => value + 1);
    });
  }, []);
  return getTransport().snapshot("files").folders;
}

export function folderForFile(fileId: string) {
  for (const folder of getTransport().snapshot("files").folders) {
    if (folder.files.some((file) => file.id === fileId)) {
      return folder;
    }
  }
  return null;
}
