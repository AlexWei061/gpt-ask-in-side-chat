const messages = {
  en: {
    askInSideChat: "Ask in side chat",
    composerPlaceholder: "Ask about this selection…",
    extractionUncertain: "The complete visible conversation could not be verified.",
  },
  "zh-CN": {
    askInSideChat: "Ask in side chat",
    composerPlaceholder: "针对这段内容提问…",
    extractionUncertain: "无法确认已完整读取当前页面中的对话。",
  },
} as const;

export type CopyKey = keyof typeof messages.en;

export function t(key: CopyKey, language = typeof navigator === "undefined" ? "en" : navigator.language): string {
  return messages[language.toLowerCase().startsWith("zh") ? "zh-CN" : "en"][key];
}
