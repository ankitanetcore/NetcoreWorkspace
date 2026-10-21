import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppShell } from "@/components/AppShell";
import { CallProvider } from "@/features/call/CallSession";
import { NameGate } from "@/features/entry/NameGate";
import { SessionProvider, useSession } from "@/session/Session";
import { loadWorkspaceFonts } from "@/theme/loadFonts";
import { colors, font, text } from "@/theme/tokens";
import { connectionPhase, subscribeConnection, type ConnectionPhase } from "@/transport/connectionPhase";
import { getTransport } from "@/transport";

loadWorkspaceFonts();

export default function RootLayout() {
  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="dark" />
      <SessionProvider>
        <Workspace />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function Workspace() {
  const { name, ready } = useSession();
  const [restored, setRestored] = useState(Platform.OS !== "web");

  useEffect(() => {
    if (Platform.OS !== "web" || !name) {
      return;
    }
    return getTransport().subscribe("rooms", (envelope) => {
      if (envelope.type === "snapshot") {
        setRestored(true);
      }
    });
  }, [name]);

  if (!ready) {
    return null;
  }

  if (!name) {
    return <NameGate />;
  }

  if (!restored) {
    return <Restoring />;
  }

  return (
    <CallProvider>
      <AppShell>
        <Slot />
      </AppShell>
    </CallProvider>
  );
}

function Restoring() {
  const [phase, setPhase] = useState<ConnectionPhase>(connectionPhase);

  useEffect(() => subscribeConnection(setPhase), []);

  const label = phase === "reconnecting" || phase === "disconnected" ? "Reconnecting…" : "Restoring your workspace…";

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
      <Text style={[text.body, font.ui]}>{label}</Text>
    </View>
  );
}
