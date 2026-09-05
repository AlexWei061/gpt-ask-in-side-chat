const messages = {
  askInSideChat: "在侧栏中提问",
  composerPlaceholder: "针对所选内容提问……",
  extractionUncertain: "无法确认已完整读取当前页面中的对话。",
} as const;

export type CopyKey = keyof typeof messages;

export function t(key: CopyKey, _language?: string): string {
  return messages[key];
}
