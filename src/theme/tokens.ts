import { Platform, type TextStyle } from "react-native";

export const colors = {
  background: "#F3EEE6",
  canvas: "#F7F2EA",
  surface: "#FFFCF8",
  surfaceMuted: "#E8E0D4",
  bubble: "#FFFCF8",
  bubbleMine: "#F6EEEF",
  navy: "#142033",
  navyRaised: "#243044",
  ink: "#1A2330",
  muted: "#5C6672",
  faint: "#8B8176",
  line: "#E0D8CC",
  burgundy: "#7A3040",
  burgundySoft: "#F4E6E8",
  sidebar: "#121C2E",
  sidebarText: "#F4EFE7",
  sidebarMuted: "#9AA6B8",
  youText: "#F6F1E8",
  online: "#2F8F5B",
  onlineOnNavy: "#8ED0A8",
} as const;

export const layout = {
  desktopMinWidth: 960,
  railWidth: 80,
  contextWidth: 250,
  sidebarWidth: 280,
  roomListWidth: 292,
  folderListWidth: 220,
  fileListWidth: 280,
} as const;

const fontStack = {
  brand: '"Satoshi", "Geist", system-ui, sans-serif',
  ui: '"Geist", "Inter", system-ui, sans-serif',
  content: '"Inter", system-ui, sans-serif',
} as const;

export const font = {
  brand: { fontFamily: Platform.OS === "web" ? fontStack.brand : undefined },
  ui: { fontFamily: Platform.OS === "web" ? fontStack.ui : undefined },
  content: { fontFamily: Platform.OS === "web" ? fontStack.content : undefined },
} as const satisfies Record<string, TextStyle>;

export const text = {
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "600",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  paneTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600",
    color: colors.ink,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    color: colors.ink,
  },
  meta: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  faint: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.faint,
  },
} as const satisfies Record<string, TextStyle>;
