import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ProfileAvatar } from "@/components/ProfileAvatar";
import { readProfilePhoto } from "@/session/profilePhoto";
import { webPointer } from "@/theme/pressable";
import { colors, font } from "@/theme/tokens";

export function PhotoChooser({
  name,
  photoUri,
  onChange,
}: {
  name: string;
  photoUri: string;
  onChange: (photoUri: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "image/*", multiple: false, base64: false });
      const file = result.canceled ? undefined : result.assets?.[0]?.file;
      if (!file) {
        return;
      }
      const next = await readProfilePhoto(file);
      if (next) {
        onChange(next);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.row}>
      <ProfileAvatar name={name} photoUri={photoUri} size={72} backgroundColor={colors.burgundySoft} color={colors.burgundy} />
      <View style={styles.copy}>
        <Text style={styles.label}>Profile picture</Text>
        <Text style={styles.hint}>Your initials show until you upload a photo.</Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Upload profile photo"
            disabled={busy}
            onPress={() => {
              void upload();
            }}
            style={({ pressed }) => [styles.upload, webPointer, pressed && styles.pressed]}
          >
            <Text style={styles.uploadLabel}>{busy ? "Uploading" : "Upload"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  label: {
    ...font.ui,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  hint: {
    ...font.content,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  upload: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.burgundy,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadLabel: {
    ...font.ui,
    color: colors.youText,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.84,
  },
});
