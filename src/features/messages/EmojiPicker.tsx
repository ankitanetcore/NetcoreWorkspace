import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { emojiCategories, emojisFor } from "@/features/messages/emojiCatalog";
import { webPointer } from "@/theme/pressable";
import { colors, font } from "@/theme/tokens";

export function EmojiPicker({
  anchorRef,
  align = "start",
  docked = false,
  onClose,
  onSelect,
}: {
  anchorRef: { current: View | null };
  align?: "start" | "end";
  docked?: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState(emojiCategories[0].id);
  const rootRef = useRef<View>(null);
  const searchRef = useRef<TextInput>(null);
  const emojis = emojisFor(categoryId, query);
  const searching = query.trim().length > 0;

  useEffect(() => {
    const focus = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(focus);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    function onPointer(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      const root = rootRef.current as unknown as HTMLElement | null;
      const anchor = anchorRef.current as unknown as HTMLElement | null;
      if (root?.contains(target) || anchor?.contains(target)) {
        return;
      }
      onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [anchorRef, onClose]);

  return (
    <View
      ref={rootRef}
      style={[styles.popover, docked ? styles.popoverDocked : align === "end" ? styles.popoverEnd : styles.popoverStart]}
      accessibilityRole="menu"
      accessibilityLabel="Emoji picker"
    >
      <TextInput
        ref={searchRef}
        value={query}
        onChangeText={setQuery}
        placeholder="Search emoji"
        placeholderTextColor={colors.faint}
        accessibilityLabel="Search emoji"
        style={styles.search}
      />
      <View style={styles.categories}>
        {emojiCategories.map((category) => {
          const selected = !searching && category.id === categoryId;
          return (
            <Pressable
              key={category.id}
              accessibilityRole="button"
              accessibilityLabel={category.label}
              accessibilityState={{ selected }}
              onPress={() => {
                setCategoryId(category.id);
                setQuery("");
              }}
              style={({ pressed, hovered }) => [
                styles.category,
                selected && styles.categoryOn,
                hovered && !selected ? styles.categoryHover : null,
                webPointer,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.categoryIcon}>{category.icon}</Text>
            </Pressable>
          );
        })}
      </View>
      <ScrollView style={styles.gridScroll} contentContainerStyle={styles.grid} keyboardShouldPersistTaps="handled">
        {emojis.length === 0 ? (
          <Text style={styles.empty}>No matches</Text>
        ) : (
          emojis.map((emoji) => (
            <Pressable
              key={`${emoji.char}-${emoji.name}`}
              accessibilityRole="button"
              accessibilityLabel={emoji.name}
              onPress={() => onSelect(emoji.char)}
              style={({ pressed, hovered }) => [
                styles.emoji,
                hovered && styles.emojiHover,
                webPointer,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.glyph}>{emoji.char}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  popover: {
    position: "absolute",
    bottom: "100%",
    width: 320,
    height: 350,
    marginBottom: 8,
    zIndex: 30,
    padding: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    shadowColor: colors.navy,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  popoverStart: {
    left: 0,
  },
  popoverEnd: {
    right: 0,
  },
  popoverDocked: {
    position: "relative",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    marginBottom: 0,
  },
  search: {
    ...font.content,
    height: 34,
    marginBottom: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    outlineWidth: 0,
  },
  categories: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  category: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryOn: {
    backgroundColor: colors.burgundySoft,
  },
  categoryHover: {
    backgroundColor: colors.surfaceMuted,
  },
  categoryIcon: {
    fontSize: 16,
    lineHeight: 20,
  },
  gridScroll: {
    flex: 1,
    minHeight: 0,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
  },
  emoji: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiHover: {
    backgroundColor: colors.burgundySoft,
  },
  glyph: {
    fontSize: 22,
    lineHeight: 26,
  },
  empty: {
    ...font.content,
    color: colors.faint,
    fontSize: 13,
    lineHeight: 18,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  pressed: {
    opacity: 0.72,
  },
});
