import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { followTheme, watchPageTheme } from "../src/shared/theme";

let media: MediaQueryList;
let systemDark: boolean;
const cleanups: Array<() => void> = [];
const originalUrl = window.location.href;

function setSystemTheme(dark: boolean): void {
  systemDark = dark;
  media.dispatchEvent(new Event("change"));
}

function sendTheme(theme: unknown, origin = "https://chatgpt.com", source: MessageEventSource | null = window.parent): void {
  window.dispatchEvent(new MessageEvent("message", { data: { type: "side-chat:theme", theme }, origin, source }));
}

beforeEach(() => {
  document.head.innerHTML = "";
  for (const name of ["class", "style", "data-theme", "data-side-chat-theme"]) document.documentElement.removeAttribute(name);
  systemDark = false;
  media = new EventTarget() as MediaQueryList;
  Object.defineProperty(media, "matches", { get: () => systemDark });
  vi.spyOn(window, "matchMedia").mockReturnValue(media);
});

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  window.history.replaceState(null, "", originalUrl);
});

describe("page theme", () => {
  it.each(["class", "data-theme", "style", "computed style"])("prefers explicit %s over the system and returns to the system when removed", async (source) => {
    const root = document.documentElement;
    if (source === "class") root.className = "light";
    else if (source === "data-theme") root.dataset.theme = "light";
    else if (source === "style") root.style.colorScheme = "light";
    else { document.head.innerHTML = "<style>.page-light { color-scheme: light; }</style>"; root.className = "page-light"; }
    setSystemTheme(true);
    const changed = vi.fn();
    cleanups.push(watchPageTheme(document, changed));
    expect(changed).toHaveBeenCalledExactlyOnceWith("light");
    root.removeAttribute("class");
    root.removeAttribute("data-theme");
    root.removeAttribute("style");
    await vi.waitFor(() => expect(changed).toHaveBeenLastCalledWith("dark"));
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("follows explicit and system changes without duplicate notifications, then cleans up", async () => {
    const changed = vi.fn();
    const cleanup = watchPageTheme(document, changed);
    cleanups.push(cleanup);
    expect(changed).toHaveBeenCalledExactlyOnceWith("light");
    setSystemTheme(true);
    expect(changed).toHaveBeenLastCalledWith("dark");
    document.documentElement.className = "dark";
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(changed).toHaveBeenCalledTimes(2);
    document.documentElement.className = "light";
    await vi.waitFor(() => expect(changed).toHaveBeenLastCalledWith("light"));
    cleanup();
    setSystemTheme(false);
    document.documentElement.className = "dark";
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it("treats a multi-value color scheme as system-following", () => {
    document.documentElement.style.colorScheme = "light dark";
    const changed = vi.fn();
    cleanups.push(watchPageTheme(document, changed));
    setSystemTheme(true);
    expect(changed.mock.calls).toEqual([["light"], ["dark"]]);
  });
});

describe("settings theme", () => {
  it("follows the system in standalone settings and ignores theme messages", () => {
    window.history.replaceState(null, "", "/?theme=dark");
    const cleanup = followTheme(document);
    cleanups.push(cleanup);
    expect(document.documentElement.dataset.sideChatTheme).toBe("light");
    sendTheme("dark");
    expect(document.documentElement.dataset.sideChatTheme).toBe("light");
    setSystemTheme(true);
    expect(document.documentElement.dataset.sideChatTheme).toBe("dark");
    cleanup();
    setSystemTheme(false);
    expect(document.documentElement.dataset.sideChatTheme).toBe("dark");
  });

  it("uses the embedded initial theme and accepts updates only from the ChatGPT parent", () => {
    window.history.replaceState(null, "", "/?embedded=1&theme=dark");
    document.body.innerHTML = '<input value="unsaved">';
    const input = document.querySelector("input");
    const cleanup = followTheme(document);
    cleanups.push(cleanup);
    expect(document.documentElement.dataset.sideChatTheme).toBe("dark");
    sendTheme("light", "https://untrusted.example");
    sendTheme("light", "https://chatgpt.com", null);
    sendTheme("invalid");
    window.dispatchEvent(new MessageEvent("message", { data: null, origin: "https://chatgpt.com", source: window.parent }));
    window.dispatchEvent(new MessageEvent("message", { data: { type: "other", theme: "light" }, origin: "https://chatgpt.com", source: window.parent }));
    expect(document.documentElement.dataset.sideChatTheme).toBe("dark");
    sendTheme("light");
    expect(document.documentElement.dataset.sideChatTheme).toBe("light");
    setSystemTheme(true);
    expect(document.documentElement.dataset.sideChatTheme).toBe("light");
    expect(document.querySelector("input")).toBe(input);
    expect(input?.value).toBe("unsaved");
    cleanup();
    sendTheme("dark");
    expect(document.documentElement.dataset.sideChatTheme).toBe("light");
  });

  it("falls back to the system until an embedded theme is available", () => {
    window.history.replaceState(null, "", "/?embedded=1&theme=invalid");
    cleanups.push(followTheme(document));
    expect(document.documentElement.dataset.sideChatTheme).toBe("light");
    setSystemTheme(true);
    expect(document.documentElement.dataset.sideChatTheme).toBe("dark");
    sendTheme("light");
    expect(document.documentElement.dataset.sideChatTheme).toBe("light");
  });
});
