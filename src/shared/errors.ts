export type ExtensionErrorCode =
  | "EXTRACTION_UNCERTAIN"
  | "KEY_REQUIRED"
  | "PERMISSION_REQUIRED"
  | "AUTHENTICATION_FAILED"
  | "RATE_LIMITED"
  | "CONTEXT_OVERFLOW"
  | "ATTACHMENT_FAILED"
  | "NETWORK_FAILED"
  | "PROTOCOL_FAILED"
  | "STORAGE_FAILED";

export class ExtensionError extends Error {
  readonly retryable: boolean;

  constructor(readonly code: ExtensionErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "ExtensionError";
    this.retryable = retryable;
  }
}
