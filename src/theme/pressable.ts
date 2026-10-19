import { Platform, type ViewStyle } from "react-native";

export const webPointer: ViewStyle =
  Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : {};

export const webMotion: ViewStyle =
  Platform.OS === "web"
    ? ({ transitionProperty: "background-color, opacity", transitionDuration: "160ms", transitionTimingFunction: "ease" } as ViewStyle)
    : {};
