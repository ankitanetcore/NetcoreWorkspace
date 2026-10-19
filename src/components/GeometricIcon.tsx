import { StyleSheet, View } from "react-native";

export type IconName =
  | "rooms"
  | "files"
  | "call"
  | "general"
  | "gtm"
  | "engineering"
  | "folder"
  | "file"
  | "people";

export function GeometricIcon({
  name,
  color,
  size = 18,
}: {
  name: IconName;
  color: string;
  size?: number;
}) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {renderShape(name, color, size)}
    </View>
  );
}

function renderShape(name: IconName, color: string, size: number) {
  switch (name) {
    case "general":
      return (
        <View
          style={{
            width: size * 0.72,
            height: size * 0.72,
            borderRadius: size,
            borderWidth: 1.75,
            borderColor: color,
          }}
        />
      );
    case "gtm":
      return (
        <View
          style={{
            width: size * 0.52,
            height: size * 0.52,
            borderWidth: 1.75,
            borderColor: color,
            transform: [{ rotate: "45deg" }],
          }}
        />
      );
    case "engineering":
      return <Triangle color={color} size={size * 0.78} />;
    case "rooms":
      return (
        <View
          style={{
            width: size * 0.72,
            height: size * 0.72,
            borderRadius: 3,
            borderWidth: 1.75,
            borderColor: color,
          }}
        />
      );
    case "files":
    case "folder":
      return <FolderShape color={color} size={size} />;
    case "call":
      return (
        <View
          style={{
            width: size * 0.92,
            height: size * 0.66,
            borderRadius: 3,
            borderWidth: 1.75,
            borderColor: color,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: size * 0.2,
              height: size * 0.2,
              borderRadius: size,
              backgroundColor: color,
            }}
          />
        </View>
      );
    case "people":
      return (
        <View style={{ width: size * 0.72, height: size * 0.78, alignItems: "center" }}>
          <View
            style={{
              width: size * 0.28,
              height: size * 0.28,
              borderRadius: size,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              width: size * 0.62,
              height: size * 0.34,
              marginTop: size * 0.08,
              borderTopLeftRadius: size,
              borderTopRightRadius: size,
              borderWidth: 1.75,
              borderBottomWidth: 0,
              borderColor: color,
            }}
          />
        </View>
      );
    case "file":
      return (
        <View
          style={{
            width: size * 0.62,
            height: size * 0.8,
            borderRadius: 2,
            borderWidth: 1.75,
            borderColor: color,
          }}
        />
      );
    default:
      return null;
  }
}

function Triangle({ color, size }: { color: string; size: number }) {
  return (
    <View
      style={{
        width: 0,
        height: 0,
        borderLeftWidth: size / 2,
        borderRightWidth: size / 2,
        borderBottomWidth: size * 0.86,
        borderLeftColor: "transparent",
        borderRightColor: "transparent",
        borderBottomColor: color,
      }}
    />
  );
}

function FolderShape({ color, size }: { color: string; size: number }) {
  return (
    <View style={{ width: size * 0.86, height: size * 0.7 }}>
      <View
        style={[
          styles.folderTab,
          {
            backgroundColor: color,
            width: size * 0.38,
            height: size * 0.16,
          },
        ]}
      />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: size * 0.52,
          borderRadius: 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  folderTab: {
    position: "absolute",
    top: 0,
    left: 0,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
});
