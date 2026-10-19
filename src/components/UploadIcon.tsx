import { createElement } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { colors } from "@/theme/tokens";

export function UploadIcon({ size = 20, color = colors.burgundy }: { size?: number; color?: string }) {
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
      createElement("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
      createElement("polyline", { points: "17 8 12 3 7 8" }),
      createElement("line", { x1: "12", x2: "12", y1: "3", y2: "15" }),
    );
  }
  return (
    <View style={[styles.mark, { width: size, height: size }]}>
      <View style={[styles.arrow, { borderBottomColor: color }]} />
      <View style={[styles.stem, { backgroundColor: color }]} />
      <View style={[styles.tray, { borderColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 5,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  stem: {
    width: 1.5,
    height: 6,
    marginBottom: 2,
  },
  tray: {
    width: 14,
    height: 6,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
});
