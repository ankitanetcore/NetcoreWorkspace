/** Drag the bar above the box. Pulling up makes the typing area taller. */
export function bindResizeGrip(
  grip: HTMLElement,
  box: HTMLTextAreaElement,
  options: {
    minimum: number;
    ceiling: { current: number };
    onHeight: (height: number) => void;
  },
) {
  grip.dataset.composerGrip = "true";
  grip.title = "Drag up or down to resize the message box";
  const bar = grip.firstElementChild;
  if (bar instanceof HTMLElement) {
    bar.dataset.gripBar = "true";
  }
  const down = (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = box.offsetHeight;
    box.dataset.manual = "1";
    const move = (pointer: PointerEvent) => {
      const next = Math.round(startHeight + (startY - pointer.clientY));
      options.onHeight(Math.max(options.minimum, Math.min(options.ceiling.current, next)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  grip.addEventListener("pointerdown", down);
  return () => grip.removeEventListener("pointerdown", down);
}

/** How tall the typing box can grow before it covers the rest of the conversation. */
export function composerCeiling(box: HTMLElement, minimum: number) {
  const root = box.closest("[data-composer-root]") as HTMLElement | null;
  const pane = (box.closest("[data-file-drop='true']") || box.closest("[data-thread-panel='true']")) as HTMLElement | null;
  if (!pane) {
    const fallback = typeof window === "undefined" ? minimum * 8 : Math.round(window.innerHeight * 0.92);
    return Math.max(minimum, fallback);
  }
  let reserved = 0;
  for (const child of Array.from(pane.children)) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }
    if (child === root || child.contains(box) || (root !== null && child.contains(root))) {
      continue;
    }
    const style = getComputedStyle(child);
    if (style.display === "none" || style.position === "absolute" || style.position === "fixed") {
      continue;
    }
    if (Number.parseFloat(style.flexShrink || "0") > 0) {
      continue;
    }
    reserved += child.offsetHeight;
  }
  const chrome = root ? Math.max(0, root.offsetHeight - box.offsetHeight) : 0;
  return Math.max(minimum, Math.floor(pane.clientHeight - reserved - chrome));
}
