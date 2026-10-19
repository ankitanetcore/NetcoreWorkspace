import { Platform } from "react-native";

const fontCss = `
:root {
  --font-brand: "Satoshi", "Geist", system-ui, sans-serif;
  --font-ui: "Geist", "Inter", system-ui, sans-serif;
  --font-content: "Inter", system-ui, sans-serif;
}
`;

const stylesheets = [
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap",
  "https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap",
];

export function loadWorkspaceFonts() {
  if (Platform.OS !== "web" || typeof document === "undefined" || document.getElementById("netcore-fonts")) {
    return;
  }
  const marker = document.createElement("meta");
  marker.id = "netcore-fonts";
  document.head.appendChild(marker);
  const style = document.createElement("style");
  style.textContent = fontCss;
  document.head.appendChild(style);
  for (const href of stylesheets) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }
}
