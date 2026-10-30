import { StyleSheet, Text, View } from "react-native";

import { colors, font } from "@/theme/tokens";

export function DayDivider({ label }: { label: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.line,
  },
  label: {
    ...font.ui,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
});
