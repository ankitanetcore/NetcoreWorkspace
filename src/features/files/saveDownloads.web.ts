export function saveDownloads(files: Array<{ url: string; name: string }>) {
  for (const file of files) {
    const anchor = document.createElement("a");
    anchor.href = file.url;
    anchor.download = file.name;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
}
