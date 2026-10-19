import { Pressable, StyleSheet, Text } from "react-native";

import { webPointer } from "@/theme/pressable";
import { colors } from "@/theme/tokens";

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onPress}
      style={({ pressed }) => [styles.back, webPointer, pressed && styles.pressed]}
    >
      <Text style={styles.label}>Back</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    color: colors.burgundy,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
});
