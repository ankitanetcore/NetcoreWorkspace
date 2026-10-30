import type { Href } from "expo-router";

import type { IconName } from "@/components/GeometricIcon";

export interface Section {
  href: Href;
  label: string;
  icon: IconName;
}

export const sections: readonly Section[] = [
  { href: "/rooms", label: "Chat", icon: "chat" },
  { href: "/files", label: "Files", icon: "files" },
  { href: "/people", label: "People", icon: "people" },
];

export type WorkspaceSection = "chat" | "files" | "people";

export function activeSection(pathname: string): WorkspaceSection {
  if (pathname === "/files" || pathname.startsWith("/files/")) {
    return "files";
  }
  if (pathname === "/people" || pathname.startsWith("/people/")) {
    return "people";
  }
  return "chat";
}

export function isSectionActive(pathname: string, href: Href) {
  const path = typeof href === "string" ? href : href.pathname;
  if (path === "/rooms") {
    return activeSection(pathname) === "chat";
  }
  if (path === "/files") {
    return activeSection(pathname) === "files";
  }
  if (path === "/people") {
    return activeSection(pathname) === "people";
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}
