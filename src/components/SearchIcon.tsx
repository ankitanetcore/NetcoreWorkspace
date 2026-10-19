import { createElement } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { colors } from "@/theme/tokens";

export function SearchIcon({ size = 16, color = colors.faint }: { size?: number; color?: string }) {
  if (Platform.OS === "web") {
    return createElement(
      "svg",
      {
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: color,
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": true,
      },
      createElement("circle", { cx: "11", cy: "11", r: "7" }),
      createElement("line", { x1: "21", x2: "16.65", y1: "21", y2: "16.65" }),
    );
  }
  return (
    <View style={[styles.mark, { width: size, height: size }]}>
      <View style={[styles.ring, { borderColor: color }]} />
      <View style={[styles.handle, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  handle: {
    position: "absolute",
    width: 5,
    height: 1.5,
    right: 0,
    bottom: 2,
    transform: [{ rotate: "45deg" }],
  },
});
