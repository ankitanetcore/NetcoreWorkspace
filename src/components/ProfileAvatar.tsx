import { Image, StyleSheet, Text, View } from "react-native";

import { profileInitials } from "@/session/profile";
import { font } from "@/theme/tokens";

export function ProfileAvatar({
  name,
  photoUri,
  size,
  backgroundColor,
  color,
}: {
  name: string;
  photoUri?: string;
  size: number;
  backgroundColor: string;
  color: string;
}) {
  const photo = photoUri?.trim();
  return (
    <View
      style={[
        styles.face,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
        },
      ]}
    >
      {photo ? (
        <Image accessibilityIgnoresInvertColors source={{ uri: photo }} style={{ width: size, height: size }} />
      ) : (
        <Text
          style={[
            styles.letters,
            font.ui,
            { color, fontSize: Math.max(11, Math.round(size * 0.34)), lineHeight: Math.max(14, Math.round(size * 0.4)) },
          ]}
        >
          {profileInitials(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  face: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  letters: {
    fontWeight: "600",
  },
});
