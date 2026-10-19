import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { PresencePeer } from "@/domain/types";
import { useSession } from "@/session/Session";
import { webPointer } from "@/theme/pressable";
import { colors } from "@/theme/tokens";
import { getTransport } from "@/transport";
import { connectionPhase, subscribeConnection, type ConnectionPhase } from "@/transport/connectionPhase";

const labels: Record<ConnectionPhase, string> = {
  connected: "Connected through Causeway",
  connecting: "Connecting...",
  reconnecting: "Reconnecting...",
  disconnected: "Disconnected",
};

const connectionWords: Record<ConnectionPhase, string> = {
  connected: "Connected",
  connecting: "Connecting",
  reconnecting: "Reconnecting",
  disconnected: "Disconnected",
};

function onlinePeers() {
  return getTransport()
    .snapshot("presence")
    .peers.filter((peer) => peer.status === "online" && peer.displayName.length > 0)
    .slice()
    .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.clientId.localeCompare(right.clientId));
}

export function ConnectionIndicator() {
  const { name, clientId } = useSession();
  const [phase, setPhase] = useState<ConnectionPhase>(connectionPhase);
  const [open, setOpen] = useState(false);
  const [peers, setPeers] = useState<PresencePeer[]>(onlinePeers);

  useEffect(() => subscribeConnection(setPhase), []);

  useEffect(() => {
    return getTransport().subscribe("presence", () => {
      setPeers(onlinePeers());
    });
  }, []);

  const status = labels[phase];

  return (
    <View style={styles.wrap}>
      {open ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Network</Text>
          {phase === "connected" ? <Text style={styles.panelBody}>Connected through Causeway</Text> : null}
          <Text style={styles.panelLabel}>Your identity</Text>
          <Text style={styles.panelBody}>{name}</Text>
          <Text style={styles.panelMeta}>{clientId.slice(0, 8)}</Text>
          <Text style={styles.panelLabel}>Connected peers</Text>
          {phase === "connected" ? (
            peers.length === 0 ? (
              <Text style={styles.panelMeta}>None</Text>
            ) : (
              peers.map((peer) => (
                <Text key={peer.clientId} style={styles.panelBody}>
                  {peer.displayName}
                </Text>
              ))
            )
          ) : (
            <Text style={styles.panelMeta}>Not available</Text>
          )}
          <Text style={styles.panelLabel}>Connection</Text>
          <Text style={styles.panelBody}>{connectionWords[phase]}</Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.status, webPointer, pressed && styles.pressed]}
      >
        <Text style={styles.statusText} numberOfLines={1}>
          {status}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  status: {
    alignSelf: "stretch",
  },
  statusText: {
    color: colors.sidebarMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "400",
  },
  panel: {
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.navyRaised,
  },
  panelTitle: {
    color: colors.sidebarText,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    marginBottom: 2,
  },
  panelLabel: {
    color: colors.sidebarMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    marginTop: 8,
  },
  panelBody: {
    color: colors.sidebarText,
    fontSize: 13,
    lineHeight: 18,
  },
  panelMeta: {
    color: colors.sidebarMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.72,
  },
});
