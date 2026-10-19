import { useRouter, usePathname } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { ConversationNav } from "@/components/ConversationNav";
import { GeometricIcon } from "@/components/GeometricIcon";
import { ProfileMenu } from "@/components/ProfileMenu";
import { FolderNav } from "@/features/files/FolderNav";
import { activeSection, isSectionActive, sections, type WorkspaceSection } from "@/navigation/sections";
import { webMotion, webPointer } from "@/theme/pressable";
import { colors, font, layout } from "@/theme/tokens";

export function AppShell({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const desktop = width >= layout.desktopMinWidth;
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, desktop ? styles.rootDesktop : styles.rootMobile]}>
      {desktop ? <Rail topInset={insets.top} pathname={pathname} /> : null}
      {desktop && activeSection(pathname) !== "people" ? <ContextSidebar pathname={pathname} topInset={insets.top} /> : null}
      <View style={[styles.content, { paddingTop: desktop ? 0 : insets.top }]}>
        {desktop ? null : <ProfileMenu anchor="bar" />}
        {children}
      </View>
      {desktop ? null : <BottomNav pathname={pathname} bottomInset={insets.bottom} />}
    </View>
  );
}

function Rail({ topInset, pathname }: { topInset: number; pathname: string }) {
  return (
    <View style={[styles.rail, { paddingTop: topInset + 16 }]}>
      <View accessibilityRole="header" accessibilityLabel="Netcore Workspace" style={styles.mark}>
        <View style={styles.markDiamond} />
      </View>
      <View style={styles.railNav}>
        {sections.map((item) => (
          <RailItem
            key={item.label}
            label={item.label}
            icon={item.icon}
            href={item.href}
            active={isSectionActive(pathname, item.href)}
          />
        ))}
      </View>
      <ProfileMenu anchor="rail" />
    </View>
  );
}

function ContextSidebar({ pathname, topInset }: { pathname: string; topInset: number }) {
  const section = activeSection(pathname);

  return (
    <View style={[styles.context, { paddingTop: topInset + 16 }]}>
      <View style={styles.contextBody}>
        <ContextPane section={section} />
      </View>
      <View style={styles.connection}>
        <ConnectionIndicator />
      </View>
    </View>
  );
}

function ContextPane({ section }: { section: WorkspaceSection }) {
  if (section === "files") {
    return <FolderNav />;
  }
  return <ConversationNav />;
}

function BottomNav({ pathname, bottomInset }: { pathname: string; bottomInset: number }) {
  return (
    <View style={[styles.bottom, { paddingBottom: Math.max(bottomInset, 10) }]}>
      {sections.map((section) => (
        <NavItem
          key={section.label}
          label={section.label}
          icon={section.icon}
          href={section.href}
          active={isSectionActive(pathname, section.href)}
        />
      ))}
    </View>
  );
}

function RailItem({
  label,
  icon,
  href,
  active,
}: {
  label: string;
  icon: (typeof sections)[number]["icon"];
  href: (typeof sections)[number]["href"];
  active: boolean;
}) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={() => {
        router.push(href);
      }}
      style={({ pressed, hovered }) => [
        styles.railItem,
        active && styles.railItemActive,
        hovered && !active ? styles.railItemHover : null,
        webPointer,
        webMotion,
        pressed && styles.pressed,
      ]}
    >
      <GeometricIcon name={icon} size={18} color={active ? "#E4C8CB" : colors.sidebarMuted} />
      <Text style={[styles.railLabel, active && styles.railLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function NavItem({
  label,
  icon,
  href,
  active,
}: {
  label: string;
  icon: (typeof sections)[number]["icon"];
  href: (typeof sections)[number]["href"];
  active: boolean;
}) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={() => {
        router.push(href);
      }}
      style={({ pressed }) => [styles.bottomItem, webPointer, pressed && styles.pressed]}
    >
      <GeometricIcon name={icon} size={20} color={active ? colors.burgundy : colors.muted} />
      <Text style={[styles.bottomLabel, active && styles.bottomLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  rootDesktop: {
    flexDirection: "row",
  },
  rootMobile: {
    flexDirection: "column",
  },
  content: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: colors.canvas,
  },
  rail: {
    width: layout.railWidth,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: colors.sidebar,
    alignItems: "center",
    paddingBottom: 16,
    borderRightWidth: 1,
    borderRightColor: "#2A384E",
  },
  mark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.burgundy,
    alignItems: "center",
    justifyContent: "center",
  },
  markDiamond: {
    width: 10,
    height: 10,
    backgroundColor: colors.sidebarText,
    transform: [{ rotate: "45deg" }],
  },
  railNav: {
    marginTop: 24,
    gap: 8,
    alignItems: "center",
  },
  railItem: {
    width: 64,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
  },
  railItemHover: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  railItemActive: {
    backgroundColor: colors.navyRaised,
  },
  railLabel: {
    ...font.ui,
    color: colors.sidebarMuted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
  },
  railLabelActive: {
    color: colors.sidebarText,
  },
  context: {
    width: layout.contextWidth,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: colors.navy,
    paddingBottom: 12,
    borderRightWidth: 1,
    borderRightColor: "#2A384E",
  },
  contextBody: {
    flex: 1,
    minHeight: 0,
  },
  connection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#2A384E",
  },
  bottom: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
    paddingTop: 8,
  },
  bottomItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 6,
  },
  bottomLabel: {
    ...font.ui,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
  },
  bottomLabelActive: {
    color: colors.burgundy,
  },
  pressed: {
    opacity: 0.86,
  },
});
