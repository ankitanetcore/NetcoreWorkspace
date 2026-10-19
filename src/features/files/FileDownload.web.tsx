import { createElement } from "react";

import { DownloadIcon } from "@/components/PreviewIcons";
import { colors } from "@/theme/tokens";

export function FileDownload({
  url,
  name,
  tone = "button",
}: {
  url: string;
  name: string;
  tone?: "button" | "menu" | "link" | "icon";
}) {
  const menu = tone === "menu";
  const link = tone === "link";
  const icon = tone === "icon";
  return createElement(
    "a",
    {
      href: url,
      download: name,
      "aria-label": `Download ${name}`,
      style: icon
        ? {
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 6,
            textDecoration: "none",
          }
        : link
        ? {
            color: colors.burgundy,
            fontSize: 13,
            lineHeight: "18px",
            fontWeight: 600,
            textDecoration: "none",
          }
        : menu
          ? {
              display: "block",
              padding: "10px 14px",
              color: colors.ink,
              fontSize: 15,
              lineHeight: "20px",
              textDecoration: "none",
            }
          : {
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 36,
              padding: "0 14px",
              borderRadius: 10,
              background: colors.navy,
              color: colors.youText,
              fontSize: 13,
              lineHeight: "18px",
              fontWeight: 600,
              textDecoration: "none",
            },
    },
    icon ? createElement(DownloadIcon) : "Download",
  );
}
