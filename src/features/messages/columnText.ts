import { Platform, type TextStyle } from "react-native";

const monoFamily =
  Platform.OS === "web"
    ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'
    : "monospace";

/** Messages that use spaces to line columns up, such as a text drawing. */
export function usesColumnSpacing(body: string) {
  return / {2}|\n +/.test(body);
}

export function columnTextStyle(body: string): TextStyle | null {
  if (!usesColumnSpacing(body)) {
    return null;
  }
  return {
    fontFamily: monoFamily,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 0,
    fontWeight: "400",
    ...(Platform.OS === "web" ? { whiteSpace: "pre" } : null),
  } as TextStyle;
}
