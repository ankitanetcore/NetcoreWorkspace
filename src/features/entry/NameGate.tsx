import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useSession } from "@/session/Session";
import { webPointer } from "@/theme/pressable";
import { colors, text } from "@/theme/tokens";

export function NameGate() {
  const { enter } = useSession();
  const [draft, setDraft] = useState("");
  const name = draft.trim();

  function continueIn() {
    if (!name) {
      return;
    }
    enter(name);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.brand}>
          <View style={styles.mark}>
            <View style={styles.markDiamond} />
          </View>
          <View>
            <Text style={styles.kicker}>NETCORE</Text>
            <Text accessibilityRole="header" style={styles.wordmark}>
              Workspace
            </Text>
          </View>
        </View>
        <Text style={text.body}>Enter your name to open the workspace.</Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={continueIn}
          placeholder="Your name"
          placeholderTextColor={colors.faint}
          autoFocus
          autoCapitalize="words"
          autoCorrect={false}
          accessibilityLabel="Your name"
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!name}
          onPress={continueIn}
          style={({ pressed }) => [
            styles.button,
            !name && styles.buttonDisabled,
            webPointer,
            pressed && name ? styles.pressed : null,
          ]}
        >
          <Text style={styles.buttonLabel}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    gap: 16,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  mark: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: colors.burgundy,
    alignItems: "center",
    justifyContent: "center",
  },
  markDiamond: {
    width: 11,
    height: 11,
    backgroundColor: colors.youText,
    transform: [{ rotate: "45deg" }],
  },
  kicker: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    letterSpacing: 1.4,
  },
  wordmark: {
    color: colors.navy,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "600",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  button: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonLabel: {
    color: colors.youText,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.72,
  },
});
