export type ChatRole = "user" | "assistant";

export interface ProviderConfig {
  baseUrl: string;
  model: string;
  contextWindowTokens: number;
  supportsImages: boolean;
}

export interface MainMessage {
  index: number;
  role: ChatRole;
  content: string;
  links: Array<{ label: string; href: string }>;
}

export interface QuoteReference {
  text: string;
  sourceRole: ChatRole;
  sourceMessageIndex: number;
}

export type PreparedAttachment =
  | { kind: "text"; name: string; sourceMessageIndex: number; text: string }
  | { kind: "image"; name: string; sourceMessageIndex: number; dataUrl: string };

export interface SideMessage {
  id: string;
  role: ChatRole;
  content: string;
  quote?: QuoteReference;
  status: "complete" | "incomplete";
  createdAt: string;
}

export interface SideChatRecord {
  schemaVersion: 1;
  conversationId: string;
  messages: SideMessage[];
  updatedAt: string;
}

export interface SendPayload {
  conversationId: string;
  mainMessages: MainMessage[];
  sideMessages: SideMessage[];
  quote?: QuoteReference;
  question: string;
  attachments: PreparedAttachment[];
  compressOldContext: boolean;
}
