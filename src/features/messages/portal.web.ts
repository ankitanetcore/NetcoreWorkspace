import type { ReactNode } from "react";

type CreatePortal = (node: ReactNode, container: Element) => ReactNode;

export function mountPopup(node: ReactNode): ReactNode {
  if (typeof document === "undefined") {
    return node;
  }
  const { createPortal } = require("react-dom") as { createPortal: CreatePortal };
  return createPortal(node, document.body);
}
