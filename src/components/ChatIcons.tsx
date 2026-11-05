import { createElement, type ReactNode } from "react";
import { Platform, View } from "react-native";

function StrokeIcon({
  size,
  color,
  strokeWidth,
  children,
}: {
  size: number;
  color: string;
  strokeWidth: number;
  children: ReactNode;
}) {
  if (Platform.OS !== "web") {
    return <View style={{ width: size, height: size }} />;
  }
  return createElement(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: color,
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true,
    },
    children,
  );
}

export function PaperclipIcon({ size = 18, color, strokeWidth = 1.75 }: { size?: number; color: string; strokeWidth?: number }) {
  return (
    <StrokeIcon size={size} color={color} strokeWidth={strokeWidth}>
      {createElement("path", {
        d: "m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48",
      })}
    </StrokeIcon>
  );
}

export function SmileIcon({ size = 18, color, strokeWidth = 1.75 }: { size?: number; color: string; strokeWidth?: number }) {
  return (
    <StrokeIcon size={size} color={color} strokeWidth={strokeWidth}>
      {createElement("circle", { cx: "12", cy: "12", r: "10" })}
      {createElement("path", { d: "M8 14s1.5 2 4 2 4-2 4-2" })}
      {createElement("line", { x1: "9", x2: "9.01", y1: "9", y2: "9" })}
      {createElement("line", { x1: "15", x2: "15.01", y1: "9", y2: "9" })}
    </StrokeIcon>
  );
}

export function ArrowUpIcon({ size = 16, color, strokeWidth = 1.75 }: { size?: number; color: string; strokeWidth?: number }) {
  return (
    <StrokeIcon size={size} color={color} strokeWidth={strokeWidth}>
      {createElement("path", { d: "m5 12 7-7 7 7" })}
      {createElement("path", { d: "M12 19V5" })}
    </StrokeIcon>
  );
}

export function ArrowDownRightIcon({ size = 18, color, strokeWidth = 1.75 }: { size?: number; color: string; strokeWidth?: number }) {
  return (
    <StrokeIcon size={size} color={color} strokeWidth={strokeWidth}>
      {createElement("path", { d: "m7 7 10 10" })}
      {createElement("path", { d: "M17 7v10H7" })}
    </StrokeIcon>
  );
}

export function ArrowUpLeftIcon({ size = 18, color, strokeWidth = 1.75 }: { size?: number; color: string; strokeWidth?: number }) {
  return (
    <StrokeIcon size={size} color={color} strokeWidth={strokeWidth}>
      {createElement("path", { d: "M17 17 7 7" })}
      {createElement("path", { d: "M7 17V7h10" })}
    </StrokeIcon>
  );
}

export function CheckIcon({ size = 16, color, strokeWidth = 1.75 }: { size?: number; color: string; strokeWidth?: number }) {
  return (
    <StrokeIcon size={size} color={color} strokeWidth={strokeWidth}>
      {createElement("path", { d: "M20 6 9 17l-5-5" })}
    </StrokeIcon>
  );
}

export function TrashIcon({ size = 16, color, strokeWidth = 1.75 }: { size?: number; color: string; strokeWidth?: number }) {
  return (
    <StrokeIcon size={size} color={color} strokeWidth={strokeWidth}>
      {createElement("path", { d: "M3 6h18" })}
      {createElement("path", { d: "M8 6V4h8v2" })}
      {createElement("path", { d: "M19 6l-1 14H6L5 6" })}
    </StrokeIcon>
  );
}

export function PencilIcon({ size = 16, color, strokeWidth = 1.75 }: { size?: number; color: string; strokeWidth?: number }) {
  if (Platform.OS !== "web") {
    return (
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <View
          style={{
            width: size * 0.72,
            height: strokeWidth,
            borderRadius: 1,
            backgroundColor: color,
            transform: [{ rotate: "-42deg" }],
          }}
        />
      </View>
    );
  }
  return (
    <StrokeIcon size={size} color={color} strokeWidth={strokeWidth}>
      {createElement("path", {
        d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
      })}
      {createElement("path", { d: "m15 5 4 4" })}
    </StrokeIcon>
  );
}

export function VideoIcon({ size = 18, color, strokeWidth = 1.75 }: { size?: number; color: string; strokeWidth?: number }) {
  return (
    <StrokeIcon size={size} color={color} strokeWidth={strokeWidth}>
      {createElement("path", { d: "m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" })}
      {createElement("rect", { x: "2", y: "6", width: "14", height: "12", rx: "2" })}
    </StrokeIcon>
  );
}

export function MessageSquareIcon({ size = 16, color, strokeWidth = 1.75 }: { size?: number; color: string; strokeWidth?: number }) {
  return (
    <StrokeIcon size={size} color={color} strokeWidth={strokeWidth}>
      {createElement("path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" })}
    </StrokeIcon>
  );
}

export function MoreHorizontalIcon({ size = 16, color, strokeWidth = 1.75 }: { size?: number; color: string; strokeWidth?: number }) {
  return (
    <StrokeIcon size={size} color={color} strokeWidth={strokeWidth}>
      {createElement("circle", { cx: "5", cy: "12", r: "1" })}
      {createElement("circle", { cx: "12", cy: "12", r: "1" })}
      {createElement("circle", { cx: "19", cy: "12", r: "1" })}
    </StrokeIcon>
  );
}
