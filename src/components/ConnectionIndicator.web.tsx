import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/theme/tokens";
import { connectionPhase, subscribeConnection, type ConnectionPhase } from "@/transport/connectionPhase";

const labels: Record<ConnectionPhase, string> = {
  connected: "Connected through Causeway",
  connecting: "Connecting...",
  reconnecting: "Reconnecting...",
  disconnected: "Disconnected",
};

export function ConnectionIndicator() {
  const [phase, setPhase] = useState<ConnectionPhase>(connectionPhase);

  useEffect(() => subscribeConnection(setPhase), []);

  return (
    <View style={styles.wrap}>
      <Text style={styles.statusText} numberOfLines={1}>
        {labels[phase]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "stretch",
  },
  statusText: {
    color: colors.sidebarMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "400",
  },
});
