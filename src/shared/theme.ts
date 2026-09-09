export type Theme = "light" | "dark";

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function watchPageTheme(document: Document, onChange: (theme: Theme) => void): () => void {
  const window = document.defaultView!;
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  let previous: Theme | undefined;
  const update = () => {
    const explicit = root.classList.contains("dark") ? "dark" : root.classList.contains("light") ? "light" :
      [root.dataset.theme, root.style.colorScheme, window.getComputedStyle(root).colorScheme].find(isTheme);
    const theme = explicit ?? (media.matches ? "dark" : "light");
    if (theme !== previous) { previous = theme; onChange(theme); }
  };
  const observer = new window.MutationObserver(update);
  observer.observe(root, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
  media.addEventListener("change", update);
  update();
  return () => { observer.disconnect(); media.removeEventListener("change", update); };
}

export function followTheme(document: Document): () => void {
  const window = document.defaultView!;
  const params = new URLSearchParams(window.location.search);
  const embedded = params.get("embedded") === "1";
  const initial = params.get("theme");
  let parentTheme = embedded && isTheme(initial) ? initial : undefined;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const update = () => { document.documentElement.dataset.sideChatTheme = parentTheme ?? (media.matches ? "dark" : "light"); };
  const receive = (event: MessageEvent) => {
    if (event.source !== window.parent || event.origin !== "https://chatgpt.com") return;
    if (event.data?.type !== "side-chat:theme" || !isTheme(event.data.theme)) return;
    parentTheme = event.data.theme;
    update();
  };
  media.addEventListener("change", update);
  if (embedded) window.addEventListener("message", receive);
  update();
  return () => { media.removeEventListener("change", update); window.removeEventListener("message", receive); };
}
