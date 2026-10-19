import { createElement } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { colors } from "@/theme/tokens";

export function DownloadIcon({ size = 18, color = colors.navy }: { size?: number; color?: string }) {
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
      createElement("path", { d: "M12 15V3" }),
      createElement("path", { d: "m7 10 5 5 5-5" }),
      createElement("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
    );
  }
  return (
    <View style={[styles.mark, { width: size, height: size }]}>
      <View style={[styles.stem, { backgroundColor: color }]} />
      <View style={[styles.arrow, { borderTopColor: color }]} />
    </View>
  );
}

export function CloseIcon({ size = 18, color = colors.navy }: { size?: number; color?: string }) {
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
      createElement("path", { d: "M18 6 6 18" }),
      createElement("path", { d: "m6 6 12 12" }),
    );
  }
  return <View style={{ width: size, height: size }} />;
}

const styles = StyleSheet.create({
  mark: {
    alignItems: "center",
    justifyContent: "center",
  },
  stem: {
    width: 1.5,
    height: 8,
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 5,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
});
