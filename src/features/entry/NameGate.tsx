import { useEffect, useRef, useState } from "react";
import { Animated, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ViewStyle } from "react-native";

import { PhotoChooser } from "@/components/PhotoChooser";
import { useSession } from "@/session/Session";
import { webPointer } from "@/theme/pressable";
import { colors, font } from "@/theme/tokens";

const workspacesLogo = require("../../../assets/Workspaces_Logo.png");

export function NameGate() {
  const { enter } = useSession();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [photoUri, setPhotoUri] = useState("");
  const ready = name.trim().length > 0;

  function continueIn() {
    if (!ready) {
      return;
    }
    enter({ name, title, location, photoUri });
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.column}>
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel="Workspaces by Netcore Network"
          source={workspacesLogo}
          resizeMode="contain"
          style={styles.logo}
        />
        <Text accessibilityRole="header" style={styles.welcome}>
          Welcome to your Workspace.
        </Text>
        <Text style={styles.intro}>
          Add your name to get started. You can also personalize your profile with a few extra details.
        </Text>
        <Text style={styles.fieldLabel}>
          Your name <Text style={styles.required}>(Required)</Text>
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          onSubmitEditing={continueIn}
          placeholder="e.g. Kevin Murray"
          placeholderTextColor={colors.faint}
          autoFocus
          autoCapitalize="words"
          autoCorrect={false}
          accessibilityLabel="Your name"
          style={[styles.input, webOutline]}
        />
        <ProfileAccordion
          name={name}
          photoUri={photoUri}
          title={title}
          location={location}
          onPhoto={setPhotoUri}
          onTitle={setTitle}
          onLocation={setLocation}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enter Workspace"
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          onPress={continueIn}
          style={({ pressed }) => [
            styles.button,
            ready ? styles.buttonReady : styles.buttonMuted,
            webPointer,
            pressed && ready ? styles.pressed : null,
          ]}
        >
          <Text style={[styles.buttonLabel, ready ? styles.buttonLabelReady : styles.buttonLabelMuted]}>Enter Workspace</Text>
          <ArrowIcon color={ready ? colors.youText : "#F7F2EA"} />
        </Pressable>
        <Text style={styles.note}>You can update your profile anytime in Settings.</Text>
      </View>
    </ScrollView>
  );
}

function ProfileAccordion({
  name,
  photoUri,
  title,
  location,
  onPhoto,
  onTitle,
  onLocation,
}: {
  name: string;
  photoUri: string;
  title: string;
  location: string;
  onPhoto: (photoUri: string) => void;
  onTitle: (title: string) => void;
  onLocation: (location: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<View>(null);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const node = panelRef.current as unknown as HTMLElement | null;
    if (!node || !("inert" in node)) {
      return;
    }
    if (open) {
      node.removeAttribute("inert");
    } else {
      node.setAttribute("inert", "");
    }
  }, [open]);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [open, progress]);

  const spin = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <View style={styles.accordion}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Personalize your profile, optional"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.accordionHeader, webPointer, pressed && styles.pressed]}
      >
        <View style={styles.personBadge}>
          <PersonGlyph />
        </View>
        <View style={styles.accordionCopy}>
          <Text style={styles.accordionTitle}>
            Personalize your profile <Text style={styles.optional}>(Optional)</Text>
          </Text>
          <Text style={styles.accordionSubtitle}>Add a photo, title, and location so others can get to know you.</Text>
        </View>
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <Chevron />
        </Animated.View>
      </Pressable>
      <View
        ref={panelRef}
        pointerEvents={open ? "auto" : "none"}
        aria-hidden={!open}
        style={[styles.collapse, open ? styles.collapseOpen : styles.collapseClosed]}
      >
        <View style={styles.collapseInner}>
          <AccordionFields name={name} photoUri={photoUri} title={title} location={location} onPhoto={onPhoto} onTitle={onTitle} onLocation={onLocation} />
        </View>
      </View>
    </View>
  );
}

function AccordionFields({
  name,
  photoUri,
  title,
  location,
  onPhoto,
  onTitle,
  onLocation,
}: {
  name: string;
  photoUri: string;
  title: string;
  location: string;
  onPhoto: (photoUri: string) => void;
  onTitle: (title: string) => void;
  onLocation: (location: string) => void;
}) {
  return (
    <View style={styles.accordionBody}>
      <PhotoChooser name={name} photoUri={photoUri} onChange={onPhoto} />
      <Text style={styles.innerLabel}>Title</Text>
      <TextInput
        value={title}
        onChangeText={onTitle}
        placeholder="e.g. Developer Relations Engineer"
        placeholderTextColor={colors.faint}
        autoCapitalize="words"
        autoCorrect={false}
        accessibilityLabel="Title"
        style={[styles.input, webOutline]}
      />
      <Text style={styles.innerLabel}>Location</Text>
      <TextInput
        value={location}
        onChangeText={onLocation}
        placeholder="e.g. New York, NY"
        placeholderTextColor={colors.faint}
        autoCapitalize="words"
        autoCorrect={false}
        accessibilityLabel="Location"
        style={[styles.input, webOutline]}
      />
    </View>
  );
}

function Chevron() {
  return <View style={styles.chevron} />;
}

function PersonGlyph() {
  return (
    <View style={styles.person}>
      <View style={styles.personHead} />
      <View style={styles.personBody} />
    </View>
  );
}

function ArrowIcon({ color }: { color: string }) {
  return (
    <View style={styles.arrow}>
      <View style={[styles.arrowShaft, { backgroundColor: color }]} />
      <View style={[styles.arrowHead, { borderColor: color }]} />
    </View>
  );
}

const webOutline = Platform.OS === "web" ? { outlineWidth: 0 } : null;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  column: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },
  logo: {
    width: 340,
    height: 45,
    marginBottom: 28,
  },
  welcome: {
    ...font.brand,
    color: colors.navy,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  intro: {
    ...font.content,
    marginTop: 10,
    marginBottom: 28,
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
  },
  fieldLabel: {
    ...font.ui,
    marginBottom: 8,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  required: {
    ...font.ui,
    color: colors.faint,
    fontWeight: "400",
  },
  input: {
    ...font.content,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
  },
  accordion: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  personBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  person: {
    width: 16,
    height: 16,
    alignItems: "center",
  },
  personHead: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.muted,
  },
  personBody: {
    width: 12,
    height: 6,
    marginTop: 2,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    backgroundColor: colors.muted,
  },
  accordionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  accordionTitle: {
    ...font.ui,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  optional: {
    ...font.ui,
    color: colors.faint,
    fontWeight: "400",
  },
  accordionSubtitle: {
    ...font.content,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  chevron: {
    width: 8,
    height: 8,
    marginTop: -3,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: colors.muted,
    transform: [{ rotate: "45deg" }],
  },
  collapse: {
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? ({
          display: "grid",
          transitionProperty: "grid-template-rows, opacity",
          transitionDuration: "180ms",
          transitionTimingFunction: "ease",
        } as unknown as ViewStyle)
      : null),
  },
  collapseClosed: Platform.OS === "web" ? ({ gridTemplateRows: "0fr", opacity: 0 } as ViewStyle) : { height: 0, opacity: 0 },
  collapseOpen: Platform.OS === "web" ? ({ gridTemplateRows: "1fr", opacity: 1 } as ViewStyle) : { height: "auto", opacity: 1 },
  collapseInner: {
    overflow: "hidden",
    minHeight: 0,
  },
  accordionBody: {
    gap: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  innerLabel: {
    ...font.ui,
    marginTop: 16,
    marginBottom: 8,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  button: {
    marginTop: 20,
    minHeight: 52,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  buttonReady: {
    backgroundColor: colors.burgundy,
  },
  buttonMuted: {
    backgroundColor: "#C4BEB4",
  },
  buttonLabel: {
    ...font.ui,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600",
  },
  buttonLabelReady: {
    color: colors.youText,
  },
  buttonLabelMuted: {
    color: "#F7F2EA",
  },
  arrow: {
    width: 16,
    height: 12,
    justifyContent: "center",
  },
  arrowShaft: {
    height: 1.5,
    width: 12,
  },
  arrowHead: {
    position: "absolute",
    right: 1,
    width: 7,
    height: 7,
    borderTopWidth: 1.5,
    borderRightWidth: 1.5,
    transform: [{ rotate: "45deg" }],
  },
  note: {
    ...font.content,
    marginTop: 14,
    textAlign: "center",
    color: colors.faint,
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.84,
  },
});
